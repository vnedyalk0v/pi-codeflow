export function compactBlankLines(value: string): string {
  return value
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

export function formatMarkdownBulletList(items: string[], emptyItem: string): string {
  const values = items.map((item) => item.trim()).filter((item) => item.length > 0);

  if (values.length === 0) {
    return `- ${emptyItem}`;
  }

  return values.map((item) => `- ${indentMultilineBullet(item)}`).join('\n');
}

export function hasUnresolvedTemplatePlaceholders(value: string): boolean {
  return /{{\s*[A-Za-z0-9_.-]+\s*}}/.test(value);
}

export function listUnresolvedTemplatePlaceholders(value: string): string[] {
  return [...new Set([...value.matchAll(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g)].map((match) => match[1]))];
}

export function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  if (maxChars <= 32) {
    return value.slice(0, maxChars);
  }

  const suffix = value.slice(-(maxChars - 32));
  return `[truncated ${value.length - suffix.length} chars]\n${suffix}`;
}

function indentMultilineBullet(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\n  ');
}
