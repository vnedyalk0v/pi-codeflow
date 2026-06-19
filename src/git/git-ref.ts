export interface GitRefValidationOptions {
  /**
   * Called with a human-readable reason when the ref is invalid.
   * The caller supplies the error to throw to keep this module dependency-free.
   */
  onInvalid: (reason: string) => never;
}

export function assertValidGitRef(
  ref: string,
  label: string,
  options: GitRefValidationOptions,
): string {
  const value = ref.trim();
  const reason = getGitRefRejectionReason(value);

  if (reason) {
    options.onInvalid(`${label} "${ref}" is not a valid git branch name: ${reason}`);
  }

  return value;
}

export function getGitRefRejectionReason(value: string): string | null {
  if (value.length === 0) return 'it is empty';
  if (value.startsWith('-')) return 'it must not start with "-"';
  if (value.startsWith('+')) return 'it must not start with "+"';
  if (/\s/.test(value)) return 'it must not contain whitespace';
  if (/[\x00-\x1f\x7f]/.test(value)) return 'it must not contain control characters';
  if (value.includes('..')) return 'it must not contain ".."';
  if (value.includes('@{')) return 'it must not contain "@{"';
  if (
    value.includes('~') ||
    value.includes('^') ||
    value.includes(':') ||
    value.includes('?') ||
    value.includes('*') ||
    value.includes('[') ||
    value.includes('\\')
  ) {
    return 'it must not contain git refspec metacharacters';
  }
  if (value === '@') return 'it must not be "@"';
  if (value.startsWith('/') || value.includes('//')) {
    return 'it must not contain empty path components';
  }
  if (value.endsWith('/') || value.endsWith('.') || value.endsWith('.lock')) {
    return 'it has an invalid suffix';
  }

  for (const component of value.split('/')) {
    if (component.startsWith('.')) return 'path components must not start with "."';
    if (component.endsWith('.lock')) return 'path components must not end with ".lock"';
  }

  return null;
}
