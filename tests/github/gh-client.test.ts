import { describe, expect, it } from 'vitest';

import { isGithubAuthRequiredMessage } from '../../src/github/gh-client';

describe('isGithubAuthRequiredMessage', () => {
  it('detects GitHub CLI authentication failures', () => {
    expect(isGithubAuthRequiredMessage('You are not logged into any GitHub hosts. Run gh auth login to authenticate.')).toBe(true);
    expect(isGithubAuthRequiredMessage('HTTP 401: Bad credentials')).toBe(true);
    expect(isGithubAuthRequiredMessage('authentication required')).toBe(true);
    expect(isGithubAuthRequiredMessage('No oauth token found for github.com')).toBe(true);
    expect(isGithubAuthRequiredMessage('To request the repo scope, run: gh auth refresh -s repo')).toBe(true);
  });

  it('does not classify existing PR branch names as auth failures', () => {
    expect(
      isGithubAuthRequiredMessage(
        'a pull request for branch "feat/auth-login" into branch "dev" already exists: https://github.com/org/repo/pull/1',
      ),
    ).toBe(false);
    expect(
      isGithubAuthRequiredMessage(
        'a pull request for branch "token-refresh" into branch "dev" already exists: https://github.com/org/repo/pull/2',
      ),
    ).toBe(false);
    expect(
      isGithubAuthRequiredMessage(
        'a pull request for branch "feat/oauth-flow" into branch "dev" already exists: https://github.com/org/repo/pull/3',
      ),
    ).toBe(false);
  });
});
