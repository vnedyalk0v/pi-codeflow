import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = '.';
const IGNORED_DIRS = new Set(['.git', 'node_modules']);
const LONG_MARKDOWN_CHAR_THRESHOLD = 300;
const MIN_NON_EMPTY_LINES_FOR_LONG_MARKDOWN = 10;
const MIN_TEMPLATE_NON_EMPTY_LINES = 10;
const MAX_MARKDOWN_LINE_LENGTH = 220;

const MIN_LINE_COUNTS = new Map([
  ['README.md', 60],
  ['.github/pull_request_template.md', 25],
  ['AGENTS.md', 40],
  ['skills/codeflow/SKILL.md', 25],
  ['templates/final-report.md', 20],
  ['templates/pull-request.md', 20],
]);

let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function toPosixPath(file) {
  return file.split(path.sep).join('/');
}

function markdownFiles(dir) {
  const files = [];

  for (const name of fs.readdirSync(dir)) {
    if (IGNORED_DIRS.has(name)) continue;

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

function logicalLineCount(text) {
  if (text.length === 0) return 0;
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function countHeadings(line) {
  return [...line.matchAll(/(?:^|\s)#{1,6}\s+\S/g)].length;
}

function countListMarkers(line) {
  return [...line.matchAll(/(?:^|\s)(?:[-*+]\s+|\d+[.)]\s+)/g)].length;
}

function isFenceDelimiter(line) {
  return /^(```|~~~)/.test(line.trim());
}

function isUrlLine(line) {
  return /^\s*<?https?:\/\/\S+>?\s*$/.test(line);
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function validateMinimumLineCount(file, lineCount) {
  const minimum = MIN_LINE_COUNTS.get(file);

  if (minimum !== undefined && lineCount < minimum) {
    fail(`Markdown file has fewer than ${minimum} lines: ${file} (${lineCount})`);
  }
}

function validateCompressedMarkdown(file, text, nonEmptyLineCount) {
  if (
    text.length > LONG_MARKDOWN_CHAR_THRESHOLD &&
    nonEmptyLineCount < MIN_NON_EMPTY_LINES_FOR_LONG_MARKDOWN
  ) {
    fail(
      `Markdown appears compressed: ${file} ` +
        `(${nonEmptyLineCount} non-empty lines, ${text.length} chars)`,
    );
  }
}

function validateTemplate(file, nonEmptyLineCount) {
  if (
    file.startsWith('templates/') &&
    nonEmptyLineCount < MIN_TEMPLATE_NON_EMPTY_LINES
  ) {
    fail(
      `Markdown template has fewer than ${MIN_TEMPLATE_NON_EMPTY_LINES} ` +
        `non-empty lines: ${file} (${nonEmptyLineCount})`,
    );
  }
}

function validateSkillFrontmatter(file, lines) {
  if (!file.endsWith('/SKILL.md')) return;

  if (lines[0]?.trim() !== '---') {
    fail(`Skill frontmatter must start with a YAML delimiter: ${file}`);
    return;
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---',
  );

  if (closingIndex === -1) {
    fail(`Skill frontmatter is missing a closing YAML delimiter: ${file}`);
    return;
  }

  if (closingIndex <= 1) {
    fail(`Skill frontmatter must be multi-line YAML: ${file}`);
  }
}

function validateMarkdownLines(file, lines) {
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

    if (!inFrontmatter && isFenceDelimiter(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence || inFrontmatter || trimmed.length === 0) continue;

    const tableRow = isTableRow(line);

    if (
      line.length > MAX_MARKDOWN_LINE_LENGTH &&
      !isUrlLine(line) &&
      !tableRow
    ) {
      fail(
        `Markdown line is longer than ${MAX_MARKDOWN_LINE_LENGTH} chars: ` +
          `${file}:${lineNumber}`,
      );
    }

    if (tableRow) continue;

    const headingCount = countHeadings(line);
    const listMarkerCount = countListMarkers(line);

    if (headingCount >= 2) {
      fail(`Multiple Markdown headings on one line: ${file}:${lineNumber}`);
    }

    if (headingCount >= 1 && listMarkerCount >= 1) {
      fail(`Heading and list item on one line: ${file}:${lineNumber}`);
    }

    if (listMarkerCount >= 2) {
      fail(`Multiple list items on one line: ${file}:${lineNumber}`);
    }
  }
}

for (const filePath of markdownFiles(ROOT_DIR)) {
  const file = toPosixPath(filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const nonEmptyLineCount = lines.filter((line) => line.trim().length > 0).length;
  const lineCount = logicalLineCount(text);

  validateMinimumLineCount(file, lineCount);
  validateCompressedMarkdown(file, text, nonEmptyLineCount);
  validateTemplate(file, nonEmptyLineCount);
  validateSkillFrontmatter(file, lines);
  validateMarkdownLines(file, lines);
}

if (failed) process.exit(1);
console.log('Markdown docs format check OK');
