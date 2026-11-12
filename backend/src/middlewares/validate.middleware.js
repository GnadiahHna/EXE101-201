const { z } = require('zod');
const ApiError = require('../utils/ApiError');

/**
 * Universal Validation Middleware powered by Zod.
 *
 * Enforces:
 * 1. Strict schemas (.strict()) to reject mass-assignment attributes (e.g. userType, id, isEnable).
 * 2. Rejection of unexpected object structures (e.g. NoSQL injection objects `{"$ne": null}`).
 * 3. String trimming & normalization.
 * 4. Safe pagination bounds: default page=1, limit <= 100.
 *
 * @param {object} schemas - { body?: z.ZodType, query?: z.ZodType, params?: z.ZodType }
 */
function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    try {
      if (params) {
        req.params = params.parse(req.params);
      }
      if (query) {
        req.query = query.parse(req.query);
      }
      if (body) {
        req.body = body.parse(req.body);
      }
      return next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const details = err.issues.map((issue) => ({
          field: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        }));
        const message = details.map((d) => `${d.field}: ${d.message}`).join('; ');
        return next(new ApiError(400, message || 'Dữ liệu đầu vào không hợp lệ', 'VALIDATION_ERROR', details));
      }
      return next(err);
    }
  };
}

// Common Reusable Zod Primitives
const numericIdSchema = z.string()
  .regex(/^\d+$/, 'ID phải là chuỗi số nguyên dương')
  .transform((val) => Number(val))
  .refine((val) => Number.isSafeInteger(val) && val > 0, 'ID phải lớn hơn 0');

const paginationQuerySchema = z.object({
  page: z.string()
    .optional()
    .default('1')
    .refine((val) => /^\d+$/.test(val) && Number(val) >= 1, 'Trang phải là số nguyên >= 1')
    .transform((val) => Number(val)),
  limit: z.string()
    .optional()
    .default('20')
    .refine((val) => /^\d+$/.test(val) && Number(val) >= 1 && Number(val) <= 100, 'Giới hạn phải từ 1 đến 100')
    .transform((val) => Number(val)),
  keyword: z.string().trim().max(100).optional(),
}).passthrough();

const dateStringSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD')
  .refine((val) => !Number.isNaN(Date.parse(`${val}T00:00:00Z`)), 'Ngày không hợp lệ');

module.exports = {
  validate,
  numericIdSchema,
  paginationQuerySchema,
  dateStringSchema,
};

