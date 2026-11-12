import { execSync } from 'node:child_process';
import fs from 'node:fs';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err) {
    console.error('Error getting staged files from git:', err.message);
    process.exit(1);
  }
}

const staged = getStagedFiles();
if (staged.length === 0) {
  process.exit(0);
}

const errors = [];

// Patterns for forbidden files
const ENV_FORBIDDEN = /(?:^|[/\\])\.env(?:\..+)?$/i; // matches .env, .env.local, .env.production
const ENV_ALLOWED = /(?:^|[/\\])\.env\.example$/i;
const PRIVATE_KEYS = /\.(?:pem|key|p12)$/i;
const ID_RSA = /(?:^|[/\\])id_rsa(?:[^/\\]+)?$/i;
const SQL_DUMP = /\.sql$/i;

for (const file of staged) {
  // 1. Check .env patterns
  if (ENV_FORBIDDEN.test(file) && !ENV_ALLOWED.test(file)) {
    errors.push(`[FORBIDDEN ENV] Staging environment secrets is forbidden: "${file}". Only .env.example is permitted.`);
  }

  // 2. Check private key patterns
  if (PRIVATE_KEYS.test(file) || ID_RSA.test(file)) {
    errors.push(`[FORBIDDEN KEY] Staging private key or certificate files is forbidden: "${file}".`);
  }

  // 3. Check SQL dump outside docs/
  if (SQL_DUMP.test(file) && !file.startsWith('docs/')) {
    errors.push(`[FORBIDDEN SQL] SQL dump files are only permitted inside docs/: "${file}".`);
  }

  // 4. Check file size > 5MB
  if (fs.existsSync(file)) {
    try {
      const stat = fs.statSync(file);
      if (stat.isFile() && stat.size > MAX_FILE_SIZE_BYTES) {
        const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
        errors.push(`[OVERSIZED FILE] File "${file}" is ${sizeMb}MB (limit is 5MB).`);
      }
    } catch {
      // ignore stat errors for deleted files
    }
  }
}

if (errors.length > 0) {
  console.error('\n❌ Pre-commit Security Check Failed:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  console.error('\nPlease unstage or remove the forbidden files before committing.\n');
  process.exit(1);
}

// Optional gitleaks staged check
try {
  execSync('gitleaks version', { stdio: 'ignore' });
  try {
    execSync('gitleaks protect --staged --verbose', { stdio: 'inherit' });
  } catch {
    console.error('\n❌ Gitleaks detected secrets in staged changes. Please review and remove secrets.');
    process.exit(1);
  }
} catch {
  // gitleaks not installed locally - ignore silently
}

console.log('✅ Pre-commit security check passed.');
