import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.join(process.cwd(), 'logs');
const TERMINALS_DIR = path.join(process.cwd(), '.cursor', 'projects');
const ERROR_REPORT_JSON = path.join(LOGS_DIR, 'error-report.json');
const ERROR_REPORT_TXT = path.join(LOGS_DIR, 'error-report.txt');

const errorPatterns = [
  /Error: (.+)/,
  /\[ERROR\] (.+)/,
  /\[WARN\] (.+)/,
  /Module not found: Can't resolve '(.+)'/,
  /TypeError: (.+)/,
  /ReferenceError: (.+)/,
  /Failed to compile\./,
  /webpack.cache.PackFileCacheStrategy/
];

function normalizeError(line: string): string {
  for (const pattern of errorPatterns) {
    const match = line.match(pattern);
    if (match) {
      if (line.includes('Module not found')) {
        return `Module not found: ${match[1]}`;
      }
      return match[1] || line.trim();
    }
  }
  return line.trim();
}

function collectFiles(): string[] {
  const files: string[] = [];
  if (fs.existsSync(LOGS_DIR)) {
    const logFiles = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.log') || f.endsWith('.txt'));
    logFiles.forEach(f => files.push(path.join(LOGS_DIR, f)));
  }
  if (fs.existsSync(TERMINALS_DIR)) {
    const projectDirs = fs.readdirSync(TERMINALS_DIR);
    for (const projectDir of projectDirs) {
      const terminalPath = path.join(TERMINALS_DIR, projectDir, 'terminals');
      if (fs.existsSync(terminalPath)) {
        const terminalFiles = fs.readdirSync(terminalPath).filter(f => f.endsWith('.txt'));
        terminalFiles.forEach(f => files.push(path.join(terminalPath, f)));
      }
    }
  }
  return files;
}

function runCollector() {
  const errors = new Map<string, { message: string; firstOccurrenceFile: string; fullLine: string }>();
  const files = collectFiles();
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const normalized = normalizeError(line);
        if (normalized && !errors.has(normalized)) {
          errors.set(normalized, {
            message: normalized,
            firstOccurrenceFile: filePath,
            fullLine: line.trim()
          });
        }
      }
    } catch {
      // skip unreadable files
    }
  }
  const sorted = Array.from(errors.values()).sort((a, b) => a.message.localeCompare(b.message));
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.writeFileSync(ERROR_REPORT_JSON, JSON.stringify(sorted, null, 2));
  fs.writeFileSync(ERROR_REPORT_TXT, sorted.map(e => `- ${e.message} (File: ${e.firstOccurrenceFile})`).join('\n'));
  return sorted;
}

export async function GET() {
  const result = runCollector();
  return NextResponse.json({ count: result.length, errors: result });
}

