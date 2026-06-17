# Security Policy

## Reporting vulnerabilities

Please report security concerns through GitHub Issues only when disclosure is
safe. If public disclosure would expose users, contact a maintainer privately
first and provide enough detail to reproduce or understand the risk.

## Security expectations

pi-codeflow should not require secrets for normal operation. Future integrations
must avoid printing tokens, reading secret files unnecessarily, or performing
destructive git operations by default.

Because Pi packages can affect agent behavior and extensions may execute code,
changes that expand permissions or automation must include clear documentation
and review.
