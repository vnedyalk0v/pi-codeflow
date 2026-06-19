import { describe, expect, it, vi } from 'vitest';

import { assertValidGitRef, getGitRefRejectionReason } from '../../src/index';

describe('git ref validation', () => {
  it.each([
    ['feat/x', 'feat/x'],
    ['fix/BILL-142-thing', 'fix/BILL-142-thing'],
    ['release-1.2', 'release-1.2'],
    ['feat/foo+bar', 'feat/foo+bar'],
    ['feat/refs/heads/main', 'feat/refs/heads/main'],
    ['feat/HEAD', 'feat/HEAD'],
  ])('accepts valid branch name %s', (input, expected) => {
    const onInvalid = vi.fn((reason: string): never => {
      throw new Error(reason);
    });

    expect(assertValidGitRef(input, 'Test branch', { onInvalid })).toBe(expected);
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it.each([
    ['', 'it is empty'],
    ['-foo', 'it must not start with "-"'],
    ['+foo', 'it must not start with "+"'],
    ['refs/heads/main', 'it must not start with "refs/"'],
    [' feat/x', 'it must not contain whitespace'],
    ['feat/x ', 'it must not contain whitespace'],
    ['feat/ x', 'it must not contain whitespace'],
    ['a\u0000b', 'it must not contain control characters'],
    ['a..b', 'it must not contain ".."'],
    ['a@{0}', 'it must not contain "@{"'],
    ['a:b', 'it must not contain git refspec metacharacters'],
    ['@', 'it must not be "@"'],
    ['HEAD', 'it must not be "HEAD"'],
    ['/head', 'it must not contain empty path components'],
    ['feat//x', 'it must not contain empty path components'],
    ['head/', 'it has an invalid suffix'],
    ['feat.', 'it has an invalid suffix'],
    ['head.lock', 'it has an invalid suffix'],
    ['.feat/x', 'path components must not start with "."'],
    ['feat/.x', 'path components must not start with "."'],
    ['feat.lock/x', 'path components must not end with ".lock"'],
  ])('rejects %s because %s', (input, reason) => {
    expect(getGitRefRejectionReason(input)).toBe(reason);
  });

  it('invokes onInvalid for invalid input', () => {
    const onInvalid = vi.fn((reason: string): never => {
      throw new Error(reason);
    });

    expect(() => assertValidGitRef('-foo', 'Test branch', { onInvalid })).toThrow(
      'Test branch "-foo" is not a valid git branch name: it must not start with "-"',
    );
    expect(onInvalid).toHaveBeenCalledWith(
      'Test branch "-foo" is not a valid git branch name: it must not start with "-"',
    );
  });
});
