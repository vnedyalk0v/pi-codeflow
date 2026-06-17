import fs from 'node:fs';
import path from 'node:path';

let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function markdownFiles(dir) {
  const files = [];

  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;

    const file = path.join(dir, name);
    const stat = fs.statSync(file);

    if (stat.isDirectory()) {
      files.push(...markdownFiles(file));
    } else if (file.endsWith('.md')) {
      files.push(file);
    }
  }

  return files;
}

function countHeadings(line) {
  return [...line.matchAll(/(?:^|\s)#{1,6}\s+\S/g)].length;
}

function startsListItem(line) {
  return /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
}

function countListMarkers(line) {
  return [...line.matchAll(/(?:^|\s)(?:[-*+]\s+|\d+[.)]\s+)/g)].length;
}

function hasSingleLineFrontmatter(lines) {
  if (lines.length === 0) return false;
  if (!lines[0].startsWith('---')) return false;
  if (lines[0].trim() !== '---') return true;

  const closingIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
  return closingIndex === 0;
}

for (const file of markdownFiles('.')) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  if (text.length > 300 && nonEmptyLines.length < 8) {
    fail(
      `Markdown appears compressed: ${file} ` +
        `(${nonEmptyLines.length} non-empty lines, ${text.length} chars)`,
    );
  }

  if (file.startsWith(`templates${path.sep}`) && lines.length <= 2) {
    fail(`Markdown template is only one line: ${file}`);
  }

  if (file.endsWith(`${path.sep}SKILL.md`) && hasSingleLineFrontmatter(lines)) {
    fail(`Skill frontmatter must be multi-line YAML: ${file}`);
  }

  let inFence = false;
  let inFrontmatter = lines[0]?.trim() === '---';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (index > 0 && inFrontmatter && trimmed === '---') {
      inFrontmatter = false;
      continue;
    }

    if (!inFrontmatter && /^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }

    if (inFence || inFrontmatter || trimmed.length === 0) continue;

    if (
      line.length > 220 &&
      !trimmed.startsWith('http') &&
      !/^\s{4,}\S/.test(line)
    ) {
      fail(`Markdown line is longer than 220 chars: ${file}:${lineNumber}`);
    }

    const headingCount = countHeadings(line);
    if (headingCount >= 2) {
      fail(`Multiple Markdown headings on one line: ${file}:${lineNumber}`);
    }

    if (headingCount === 1 && countListMarkers(line) > 0) {
      fail(`Heading and list item on one line: ${file}:${lineNumber}`);
    }

    if (startsListItem(line) && countListMarkers(line) > 1) {
      fail(`Multiple list items on one line: ${file}:${lineNumber}`);
    }
  }
}

if (failed) process.exit(1);
console.log('Markdown docs format check OK');
