const TEMPLATE_PLACEHOLDER_PATTERN = /{{([A-Za-z][A-Za-z0-9]*)}}/g;

export function renderSimpleTemplate(templateText: string, values: Record<string, string>): string {
  const escapedValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, escapeTemplatePlaceholderSyntax(value)]),
  );

  return templateText.replace(TEMPLATE_PLACEHOLDER_PATTERN, (placeholder, key: string) => (
    Object.prototype.hasOwnProperty.call(escapedValues, key)
      ? escapedValues[key]
      : placeholder
  ));
}

export function escapeTemplatePlaceholderSyntax(value: string): string {
  return value
    .replaceAll('{{', '&#123;&#123;')
    .replaceAll('}}', '&#125;&#125;');
}
