/**
 * Collects error lines from the logs directory and produces:
 * - logs/error-report.json (unique, sorted)
 * - logs/error-report.txt  (unique, sorted, human-readable)
 *
 * This is a lightweight helper meant for local/dev use to quickly spot
 * recurring errors from terminal/log output.
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');
const projectSlug = process.cwd()
  .replace(/^[A-Z]:/, (m) => m.toLowerCase())
  .replace(/[\\/]/g, '-')
  .replace(/^-/, '');
const TERMINALS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || process.cwd(),
  '.cursor',
  'projects',
  projectSlug,
  'terminals'
);
const OUTPUT_JSON = path.join(LOG_DIR, 'error-report.json');
const OUTPUT_TXT = path.join(LOG_DIR, 'error-report.txt');

// Basic error matcher: catches "ERROR", "ERR", "✖", "⨯"
const ERROR_REGEX = /(error|err|✖|⨯)/i;

function listLogFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((f) => !fs.statSync(path.join(dir, f)).isDirectory());
  } catch (err) {
    return [];
  }
}

function collectErrors() {
  if (!fs.existsSync(LOG_DIR)) {
    console.warn(`[collectErrors] Log directory not found: ${LOG_DIR}`);
  }

  const files = listLogFiles(LOG_DIR);
  const terminalFiles = fs.existsSync(TERMINALS_DIR) ? listLogFiles(TERMINALS_DIR) : [];
  const errors = new Set();
  const sources = [];

  const collectFrom = (baseDir, fileList) => {
    for (const file of fileList) {
      const full = path.join(baseDir, file);
      let content = '';
      try {
        content = fs.readFileSync(full, 'utf-8');
      } catch (err) {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        if (ERROR_REGEX.test(line)) {
          const cleaned = line.replace(/\s+/g, ' ').trim();
          if (cleaned) {
            errors.add(cleaned);
            sources.push({ file: full, line: cleaned });
          }
        }
      }
    }
  };

  collectFrom(LOG_DIR, files);
  collectFrom(TERMINALS_DIR, terminalFiles);

  const unique = Array.from(errors).sort((a, b) => a.localeCompare(b));

  // Write outputs
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), errors: unique }, null, 2));
  fs.writeFileSync(OUTPUT_TXT, unique.join('\n'));

  return { errors: unique, sources };
}

if (require.main === module) {
  const { errors } = collectErrors();
  console.log(`[collectErrors] Collected ${errors.length} unique error lines. Outputs:`);
  console.log(`- ${OUTPUT_JSON}`);
  console.log(`- ${OUTPUT_TXT}`);
}

module.exports = { collectErrors };

