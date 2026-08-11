# Security policy

## Report a vulnerability

Do not publish credentials, private site configuration, operator identifiers, unpublished drafts, or exploit details in a public issue. Use GitHub private vulnerability reporting when available. Otherwise open a minimal issue requesting a private contact channel without sensitive details.

## Repository safety

Keep real credentials and operational data outside the repository.

Before every commit or release:

- scan for secrets, tokens, passwords, private keys, and credential files;
- scan for personal identifiers, account/chat/session IDs, IPs, hostnames, and absolute local paths;
- exclude real profiles, state, drafts, reports, history, generated production assets, and local tool state;
- inspect the staged diff and release tree manually;
- verify examples contain placeholders only.

If a secret is committed, revoke or rotate it immediately. Removing it from the latest tree is not sufficient because history may retain it.