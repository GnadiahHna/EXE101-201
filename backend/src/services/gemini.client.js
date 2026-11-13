const { configService } = require('../config/config.service');
const AiUsage = require('../models/aiUsage.model');
const logger = require('../utils/logger');

// Circuit breakers separated per purpose
const circuitBreakers = {
  triage: { failures: 0, lastFailure: 0, isOpen: false },
  intake_summary: { failures: 0, lastFailure: 0, isOpen: false },
};

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 60 * 1000; // 1 minute

function isCircuitOpen(purpose) {
  const cb = circuitBreakers[purpose] || circuitBreakers.triage;
  if (!cb.isOpen) return false;
  if (Date.now() - cb.lastFailure > CIRCUIT_RESET_MS) {
    // Half-open: allow a trial request
    cb.isOpen = false;
    cb.failures = 0;
    return false;
  }
  return true;
}

function recordSuccess(purpose) {
  const cb = circuitBreakers[purpose] || circuitBreakers.triage;
  cb.failures = 0;
  cb.isOpen = false;
}

function recordFailure(purpose) {
  const cb = circuitBreakers[purpose] || circuitBreakers.triage;
  cb.failures += 1;
  cb.lastFailure = Date.now();
  if (cb.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    cb.isOpen = true;
    logger.warn({ purpose, failures: cb.failures }, '[gemini.client] Circuit breaker OPENED');
  }
}

/**
 * Atomic Mongo Daily Budget Consumption
 * @param {string} purpose - 'triage' | 'intake_summary'
 * @param {number} maxDailyBudget
 * @returns {Promise<boolean>} - true if under budget and incremented; false if budget exceeded
 */
async function consumeDailyBudget(purpose, maxDailyBudget) {
  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const key = `${purpose}:${todayStr}`;

  try {
    const updated = await AiUsage.findOneAndUpdate(
      {
        key,
        count: { $lt: maxDailyBudget },
      },
      {
        $inc: { count: 1 },
        $setOnInsert: { purpose, date: todayStr },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    if (!updated) {
      logger.warn({ purpose, todayStr, maxDailyBudget }, '[gemini.client] Daily AI budget exhausted');
      return false;
    }
    return true;
  } catch (err) {
    // If upsert hit duplicate key race condition or count >= limit
    logger.warn({ err: err.message, purpose }, '[gemini.client] Daily budget check exception');
    // If error is duplicate key E11000, it means it already reached max or concurrent check failed
    return false;
  }
}

/**
 * Record token usage to the daily usage doc
 */
async function recordTokenUsage(purpose, totalTokens = 0) {
  if (!totalTokens) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  const key = `${purpose}:${todayStr}`;
  try {
    await AiUsage.updateOne({ key }, { $inc: { totalTokens } });
  } catch {
    // Non-blocking
  }
}

/**
 * Unified Structured Gemini caller with multi-model fallback, timeouts, budget & circuit breaker.
 *
 * @param {object} params
 * @param {'triage'|'intake_summary'} params.purpose
 * @param {string} [params.systemInstruction]
 * @param {Array<{role: string, parts: Array<{text: string}>}>} params.contents
 * @param {object} [params.responseSchema] - Optional Gemini responseSchema for structured JSON
 * @param {import('zod').ZodSchema} [params.zodSchema] - Required validator for LLM output
 * @param {number} [params.maxOutputTokens=600]
 * @param {number} [params.temperature=0.1]
 * @param {number} [params.timeoutMs=10000]
 * @returns {Promise<{ data: any, model: string, usageMetadata?: object } | null>}
 */
async function generateStructured({
  purpose = 'triage',
  systemInstruction,
  contents,
  responseSchema,
  zodSchema,
  maxOutputTokens = 600,
  temperature = 0.1,
  timeoutMs,
}) {
  // Check AI processing feature flag
  if (!configService.aiProcessingEnabled) {
    logger.info({ purpose }, '[gemini.client] AI processing disabled by config');
    return null;
  }

  const apiKey = configService.geminiApiKey;
  if (!apiKey) {
    logger.info({ purpose }, '[gemini.client] No GEMINI_API_KEY configured');
    return null;
  }

  if (isCircuitOpen(purpose)) {
    logger.warn({ purpose }, '[gemini.client] Circuit breaker active, skipping Gemini call');
    return null;
  }

  // Budget verification
  const maxBudget = purpose === 'intake_summary'
    ? configService.intakeSummaryDailyBudget
    : configService.chatDailyBudget;

  const budgetOk = await consumeDailyBudget(purpose, maxBudget);
  if (!budgetOk) {
    return null;
  }

  const effectiveTimeout = timeoutMs || (purpose === 'intake_summary' ? 20000 : 10000);
  const models = configService.geminiModels || ['gemini-3.5-flash'];

  // Try models in order (at most 1 cycle)
  for (const model of models) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const requestBody = {
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens,
          responseMimeType: 'application/json',
        },
      };

      if (responseSchema) {
        requestBody.generationConfig.responseSchema = responseSchema;
      }

      if (systemInstruction) {
        requestBody.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutHandle);

      // Handle failover status codes: 404 (model removed/unknown), 429 (rate-limit), 5xx (server error)
      if (res.status === 404 || res.status === 429 || res.status >= 500) {
        const errorText = await res.text().catch(() => '');
        logger.warn(
          { model, status: res.status, errorText: errorText.slice(0, 200) },
          '[gemini.client] Model returned failover status, trying next candidate',
        );
        continue;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        logger.error({ model, status: res.status, errorText }, '[gemini.client] Gemini request failed');
        recordFailure(purpose);
        return null;
      }

      const payload = await res.json();

      // Check prompt feedback blockReason
      if (payload?.promptFeedback?.blockReason) {
        logger.warn({ blockReason: payload.promptFeedback.blockReason }, '[gemini.client] Prompt blocked by safety');
        return null;
      }

      const candidate = payload?.candidates?.[0];
      const finishReason = candidate?.finishReason;

      // SAFETY, RECITATION, MAX_TOKENS without complete object are considered errors
      if (finishReason && finishReason !== 'STOP') {
        logger.warn({ finishReason }, '[gemini.client] Candidate finished with non-STOP status');
        return null;
      }

      const rawText = candidate?.content?.parts?.[0]?.text;
      if (!rawText) {
        logger.warn({ model }, '[gemini.client] Empty candidate text from Gemini');
        continue;
      }

      // Parse JSON
      let parsedJson;
      try {
        parsedJson = JSON.parse(rawText.trim());
      } catch (parseErr) {
        logger.warn({ parseErr: parseErr.message, rawText: rawText.slice(0, 150) }, '[gemini.client] JSON parse failed');
        return null;
      }

      // Schema validation via Zod
      if (zodSchema) {
        const validation = zodSchema.safeParse(parsedJson);
        if (!validation.success) {
          logger.warn(
            { errors: validation.error.issues, parsedJson },
            '[gemini.client] Zod schema validation failed for LLM response',
          );
          return null;
        }
        parsedJson = validation.data;
      }

      // Record successful usage
      recordSuccess(purpose);
      const totalTokens = payload?.usageMetadata?.totalTokenCount || 0;
      await recordTokenUsage(purpose, totalTokens);

      logger.info(
        {
          purpose,
          model,
          promptTokens: payload?.usageMetadata?.promptTokenCount,
          candidatesTokens: payload?.usageMetadata?.candidatesTokenCount,
          totalTokens,
        },
        '[gemini.client] Call completed successfully',
      );

      return {
        data: parsedJson,
        model,
        usageMetadata: payload?.usageMetadata,
      };
    } catch (err) {
      clearTimeout(timeoutHandle);
      if (err.name === 'AbortError') {
        logger.warn({ model, timeoutMs: effectiveTimeout }, '[gemini.client] Request aborted due to timeout');
      } else {
        logger.warn({ model, err: err.message }, '[gemini.client] Error calling model');
      }
      // Continue to next model if available
    }
  }

  // All models exhausted
  recordFailure(purpose);
  return null;
}

module.exports = {
  generateStructured,
  consumeDailyBudget,
  circuitBreakers,
};

