import fs from 'node:fs';
import path from 'node:path';

let failed = false;

const textFilePattern = /\.(md|json|yml|yaml|ts|js|mjs)$/;
const suspiciousUnicode = /[\u202A-\u202E\u2066-\u2069\u200B\u200C\u200D\uFEFF]/;

function fail(message) {
  console.error(message);
  failed = true;
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;

    const file = path.join(dir, name);
    const stat = fs.statSync(file);

    if (stat.isDirectory()) {
      walk(file);
      continue;
    }

    if (!textFilePattern.test(file)) continue;

    const text = fs.readFileSync(file, 'utf8');

    if (suspiciousUnicode.test(text)) {
      fail(`Suspicious Unicode control character found in: ${file}`);
    }

    if (/\r(?!\n)/.test(text)) {
      fail(`CR-only line ending found in: ${file}`);
    }

    if (/\r\n/.test(text)) {
      fail(`CRLF line ending found in: ${file}; normalize to LF`);
    }

    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      const ok =
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0d ||
        code >= 0x20;

      if (!ok) {
        fail(
          `Unexpected ASCII control char U+${code
            .toString(16)
            .padStart(4, '0')} in ${file}`,
        );
        break;
      }
    }
  }
}

walk('.');

if (failed) process.exit(1);
console.log('Text safety check OK');
