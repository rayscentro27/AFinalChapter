import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const envFileNames = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
];

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function loadEnvFiles(rootDir) {
  const merged = {};
  const presentFiles = [];

  for (const fileName of envFileNames) {
    const filePath = path.join(rootDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    presentFiles.push(fileName);
    Object.assign(merged, parseEnvFile(fs.readFileSync(filePath, 'utf8')));
  }

  return { merged, presentFiles };
}

function loadSupabaseCaptchaEnabled(rootDir) {
  const configPath = path.join(rootDir, 'supabase', 'config.toml');
  if (!fs.existsSync(configPath)) return false;
  const content = fs.readFileSync(configPath, 'utf8');
  const authCaptchaBlock = content.match(/\[auth\.captcha\]([\s\S]*?)(\n\[|$)/);
  if (!authCaptchaBlock) return false;
  return /enabled\s*=\s*true/i.test(authCaptchaBlock[1]);
}

function readValue(key, fileEnv) {
  const fromProcess = process.env[key];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) {
    return { value: fromProcess, source: 'process' };
  }

  const fromFile = fileEnv[key];
  if (typeof fromFile === 'string' && fromFile.length > 0) {
    return { value: fromFile, source: 'env-file' };
  }

  return { value: '', source: null };
}

function isTruthy(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

const { merged: fileEnv, presentFiles } = loadEnvFiles(projectRoot);
const frontendEnabled = readValue('VITE_TURNSTILE_ENABLED', fileEnv);
const frontendSiteKey = readValue('VITE_TURNSTILE_SITE_KEY', fileEnv);
const frontendLegacySiteKey = readValue('VITE_AUTH_TURNSTILE_SITE_KEY', fileEnv);
const localCaptchaSecret = readValue('SUPABASE_AUTH_CAPTCHA_SECRET', fileEnv);
const localCaptchaEnabled = loadSupabaseCaptchaEnabled(projectRoot);

const issues = [];
const notices = [];

if (isTruthy(frontendEnabled.value) && !frontendSiteKey.value && !frontendLegacySiteKey.value) {
  issues.push('VITE_TURNSTILE_ENABLED=true but no Turnstile site key is set. Define VITE_TURNSTILE_SITE_KEY or VITE_AUTH_TURNSTILE_SITE_KEY.');
}

if (!isTruthy(frontendEnabled.value) && (frontendSiteKey.value || frontendLegacySiteKey.value)) {
  notices.push('A Turnstile site key exists but VITE_TURNSTILE_ENABLED is not true. The widget will not render in the frontend.');
}

if (localCaptchaEnabled && !localCaptchaSecret.value) {
  issues.push('supabase/config.toml has auth.captcha.enabled=true but SUPABASE_AUTH_CAPTCHA_SECRET is not set in the environment or local env files.');
}

console.log('Auth captcha environment check');
console.log(`- Project root: ${projectRoot}`);
console.log(`- Env files found: ${presentFiles.length ? presentFiles.join(', ') : 'none'}`);
console.log(`- Frontend captcha enabled: ${isTruthy(frontendEnabled.value) ? 'yes' : 'no'}`);
console.log(`- Frontend site key present: ${frontendSiteKey.value || frontendLegacySiteKey.value ? 'yes' : 'no'}`);
console.log(`- Local Supabase captcha enabled: ${localCaptchaEnabled ? 'yes' : 'no'}`);
console.log(`- Local Supabase captcha secret present: ${localCaptchaSecret.value ? 'yes' : 'no'}`);

if (notices.length) {
  console.log('\nWarnings:');
  for (const notice of notices) {
    console.log(`- ${notice}`);
  }
}

if (issues.length) {
  console.error('\nFailures:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nNo blocking auth captcha env issues detected.');
}