#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Pre-commit hook / Security Scanner
 * Prevents committing secrets, passwords, connection strings, or private keys.
 */

const FORBIDDEN_FILE_PATTERNS = [
  /^\.env(\..+)?$/i, // Matches .env, .env.local, .env.neon, etc.
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /id_rsa/i,
  /id_ed25519/i,
];

const ALLOWED_FILES = [
  '.env.example',
  '.env.sample',
  '.env.template',
];

const SECRET_PATTERNS = [
  {
    name: 'Database URI with credentials',
    regex: /(postgres|postgresql|mysql|mongodb|redis|amqp):\/\/[^:\s'"`]+:[^@\s'"`]+@/i,
  },
  {
    name: 'Neon API/Database Token (npg_*)',
    regex: /npg_[a-zA-Z0-9_-]{8,}/,
  },
  {
    name: 'Private Key',
    regex: /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----/,
  },
  {
    name: 'GitHub Personal Access Token',
    regex: /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}/,
  },
  {
    name: 'Anthropic API Key',
    regex: /ant-api03-[a-zA-Z0-9_-]{30,}/,
  },
  {
    name: 'OpenAI API Key',
    regex: /sk-(proj-|live-)?[a-zA-Z0-9_-]{30,}/,
  },
  {
    name: 'Render API Key',
    regex: /rnd_[a-zA-Z0-9_-]{20,}/,
  },
  {
    name: 'Hardcoded Secret Assignment',
    regex: /(DATABASE_URL|JWT_SECRET|PULL_TOKEN|TELEGRAM_BOT_TOKEN)\s*[:=]\s*['"`][a-zA-Z0-9_!@#$%^&*()\-+=]{8,}['"`]/i,
  },
];

const isAllScan = process.argv.includes('--all');

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
    return output.split('\n').map(f => f.trim()).filter(Boolean);
  } catch (error) {
    console.error('Error getting staged files:', error);
    process.exit(1);
  }
}

function getStagedDiff() {
  try {
    return execSync('git diff --cached -U0', { encoding: 'utf8' });
  } catch (error) {
    console.error('Error getting staged diff:', error);
    process.exit(1);
  }
}

function getAllTrackedFiles() {
  try {
    const output = execSync('git ls-files', { encoding: 'utf8' });
    return output.split('\n').map(f => f.trim()).filter(Boolean);
  } catch (error) {
    console.error('Error getting tracked files:', error);
    process.exit(1);
  }
}

let violations = [];

if (isAllScan) {
  const files = getAllTrackedFiles();
  for (const file of files) {
    const basename = path.basename(file);
    if (ALLOWED_FILES.includes(basename)) continue;

    // Check forbidden filename
    if (FORBIDDEN_FILE_PATTERNS.some(p => p.test(basename))) {
      violations.push({
        file,
        line: 1,
        rule: `Forbidden file tracked in git (${basename})`,
        snippet: file,
      });
      continue;
    }

    // Skip scanning binaries or images
    if (/\.(png|jpe?g|gif|webp|ico|svg|pdf|lock|lockb|traineddata)$/i.test(file)) {
      continue;
    }

    // Skip self
    if (file.endsWith('prevent-secrets.mjs')) continue;

    if (!fs.existsSync(file)) continue;

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(line)) {
          // Allow comments, environment variable templates like ${VAR}, or mock test files that explicitly use dummy placeholders
          if (/\$\{[A-Za-z0-9_:-]+\}/.test(line) || /<[A-Za-z0-9_:-]+>/.test(line) || /\[[A-Za-z0-9_:-]+\]/.test(line)) {
            continue;
          }
          if (/dummy|mock|placeholder|example|changeme|fake|test_password/i.test(line) && !line.includes('npg_')) {
            continue;
          }
          violations.push({
            file,
            line: i + 1,
            rule: pattern.name,
            snippet: line.trim().slice(0, 80),
          });
        }
      }
    }
  }
} else {
  // Staged files check
  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  // 1. Check file names
  for (const file of stagedFiles) {
    const basename = path.basename(file);
    if (ALLOWED_FILES.includes(basename)) continue;

    if (FORBIDDEN_FILE_PATTERNS.some(p => p.test(basename))) {
      violations.push({
        file,
        line: 1,
        rule: `Attempt to commit forbidden secret/env file (${basename})`,
        snippet: file,
      });
    }
  }

  // 2. Check diff content
  const diff = getStagedDiff();
  const diffLines = diff.split('\n');
  let currentFile = '';
  let currentLine = 0;

  for (const line of diffLines) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.replace('+++ b/', '').trim();
      currentLine = 0;
      continue;
    }

    if (line.startsWith('@@')) {
      const match = line.match(/\+([0-9]+)/);
      if (match) {
        currentLine = parseInt(match[1], 10);
      }
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const addedContent = line.slice(1);
      const basename = path.basename(currentFile);

      if (ALLOWED_FILES.includes(basename)) continue;
      if (currentFile.endsWith('prevent-secrets.mjs')) continue;

      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(addedContent)) {
          if (/\$\{[A-Za-z0-9_:-]+\}/.test(addedContent) || /<[A-Za-z0-9_:-]+>/.test(addedContent) || /\[[A-Za-z0-9_:-]+\]/.test(addedContent)) {
            continue;
          }
          if (/dummy|mock|placeholder|example|changeme|fake|test_password/i.test(addedContent) && !addedContent.includes('npg_')) {
            continue;
          }
          violations.push({
            file: currentFile,
            line: currentLine,
            rule: pattern.name,
            snippet: addedContent.trim().slice(0, 80),
          });
        }
      }
      currentLine++;
    }
  }
}

if (violations.length > 0) {
  console.error('\x1b[41m\x1b[37m%s\x1b[0m', ' 🛑 COMMIT RECHAZADO: Se detectaron posibles secretos o credenciales 🛑 ');
  console.error('\x1b[31m%s\x1b[0m', '\nPor protocolo de seguridad de CryoTech, está prohibido commitear credenciales, URLs con contraseñas o archivos .env.\n');

  for (const v of violations) {
    console.error(`  \x1b[33m${v.file}:${v.line}\x1b[0m -> \x1b[31m[${v.rule}]\x1b[0m`);
    console.error(`    \x1b[90m${v.snippet}\x1b[0m\n`);
  }

  console.error('\x1b[36m%s\x1b[0m', '💡 Solución:');
  console.error('  1. Remueve las credenciales y leelas desde process.env.');
  console.error('  2. Si es un script temporal, usalo en una carpeta externa (scratch) y NO lo agregues al repositorio.');
  console.error('  3. Agrega archivos de configuración a .gitignore.\n');

  process.exit(1);
}

console.log('\x1b[32m✔ Secret Scanner: No se detectaron secretos en los cambios.\x1b[0m');
process.exit(0);
