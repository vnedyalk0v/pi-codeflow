export function formatInlineList(values: string[], emptyValue = 'none'): string {
  return values.length > 0 ? values.join(', ') : emptyValue;
}

export function formatBulletList(values: string[]): string {
  if (values.length === 0) {
    return '- none';
  }

  return values.map((value) => `- ${value}`).join('\n');
}

export function formatCodeflowGuidanceSection(
  heading: string,
  lines: string[],
): string {
  const body = lines.filter((line) => line.trim().length > 0).join('\n');
  return `## ${heading}\n\n${body}`;
}

export function appendCodeflowGuidanceToSystemPrompt(
  systemPrompt: string,
  systemPromptAppend: string,
): string {
  const base = systemPrompt.trimEnd();
  const append = systemPromptAppend.trim();

  if (base.length === 0) {
    return append;
  }

  return `${base}\n\n${append}`;
}
