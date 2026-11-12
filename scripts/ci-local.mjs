import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

console.log('🚀 Running ClinicBooking CI Local Pipeline...\n');

function run(command, cwd = ROOT_DIR, env = process.env) {
  console.log(`\n▶️  [${cwd === ROOT_DIR ? 'root' : path.basename(cwd)}] ${command}`);
  const result = spawnSync(command, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...env },
  });
  if (result.status !== 0) {
    console.error(`\n❌ Command failed with exit code ${result.status}: ${command}`);
    process.exit(result.status || 1);
  }
}

// Check flags
const SKIP_TESTS = process.env.SKIP_TESTS === 'true' || process.env.SKIP_TESTS === '1';
const SKIP_AUDIT = process.env.SKIP_AUDIT === 'true' || process.env.SKIP_AUDIT === '1';
const SKIP_BUILD = process.env.SKIP_BUILD === 'true' || process.env.SKIP_BUILD === '1';
const TEST_FILTER = process.env.TEST_FILTER || 'tests/security-validate-config.test.js tests/security-payment-image.test.js tests/p0-foundation.test.js tests/uc-adm-01.test.js';

if (SKIP_TESTS) console.warn('⚠️  WARNING: SKIP_TESTS is active. Tests will be skipped!');
if (SKIP_AUDIT) console.warn('⚠️  WARNING: SKIP_AUDIT is active. Security audit will be skipped!');
if (SKIP_BUILD) console.warn('⚠️  WARNING: SKIP_BUILD is active. Web build will be skipped!');

// 1. Backend Checks
console.log('\n--- 1. BACKEND CHECKS ---');
run('npm run lint', path.join(ROOT_DIR, 'backend'));

if (!SKIP_TESTS) {
  const testCmd = process.env.RUN_ALL_TESTS === '1'
    ? 'npm test'
    : `node --test ${TEST_FILTER}`;

  run(testCmd, path.join(ROOT_DIR, 'backend'), {
    ...process.env,
    NODE_ENV: 'test',
    JWT_SECRET: 'local_ci_test_jwt_secret_min_32_characters_long_12345',
    JOIN_TOKEN_SECRET: 'local_ci_test_join_token_secret_min_32_chars_12345',
    MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clinic_test',
  });
}

// 2. Web Checks
console.log('\n--- 2. WEB CHECKS ---');
run('npm run lint', path.join(ROOT_DIR, 'web'));
run('npx tsc --noEmit', path.join(ROOT_DIR, 'web'));

if (!SKIP_BUILD) {
  run('npm run build', path.join(ROOT_DIR, 'web'));
}

// 3. Security Audit
console.log('\n--- 3. SECURITY AUDIT ---');
if (!SKIP_AUDIT) {
  console.log('Running npm audit for backend (production deps)...');
  try {
    run('npm audit --omit=dev --audit-level=high', path.join(ROOT_DIR, 'backend'));
  } catch {
    console.error('Audit failed on backend dependencies');
  }

  console.log('Running npm audit for web (production deps)...');
  try {
    run('npm audit --omit=dev --audit-level=high', path.join(ROOT_DIR, 'web'));
  } catch {
    console.error('Audit failed on web dependencies');
  }
}

// 4. Docker Compose Validate (optional local)
console.log('\n--- 4. DOCKER COMPOSE CONFIG CHECK ---');
let hasDocker = false;
try {
  execSync('docker --version', { stdio: 'ignore' });
  hasDocker = true;
} catch {
  console.warn('⚠️  Docker CLI not found locally. Skipping "docker compose config -q" (will run strictly in CI).');
}

if (hasDocker) {
  run('docker compose config -q', ROOT_DIR);
  console.log('✅ docker compose configuration is valid.');
}

console.log('\n🎉 ALL CI LOCAL CHECKS PASSED SUCCESSFULLY!\n');
