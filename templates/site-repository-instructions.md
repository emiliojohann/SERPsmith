# SERPsmith repository instructions

Complete and review this file before SERPsmith changes the repository. Remove all bracketed placeholders.

## Site identity

- Public site URL: [HTTPS URL]
- Article route pattern: [example: /blog/<slug>]
- Deployment branch: [branch]
- Git remote: [remote]

## Content adapter

- Content format: [Markdown, MDX, JSON, PHP, generated HTML, or other]
- Adapter name: [reviewed adapter]
- Article source directory/file: [repository-relative path]
- Required metadata/front matter: [fields]
- Slug rules: [rules]
- Template owns the H1: [yes/no]

## Images and discovery

- Image source directory: [repository-relative path]
- Public image route: [URL path]
- Sitemap file: [repository-relative path]
- llms.txt file: [path or none]
- llms-full.txt file: [path or none]

## Allowed changes

- Files/directories SERPsmith may modify: [list]
- Reciprocal-link locations allowed: [list]
- Safe validation commands: [list]
- Safe build commands: [list]

## Prohibited actions

- Files/directories SERPsmith must not modify: [list]
- Commands SERPsmith must not run: [list]
- Never expose secrets, credentials, private paths, or operational state.
- Never force-push, rewrite Git history, resolve conflicts automatically, change branches, change schedules, or bypass failed gates.

## Deployment

- Deployment trigger: [push, reviewed adapter, or other]
- Expected propagation time: [duration]
- Live verification method: [method]
- Rollback owner: [human role; SERPsmith does not perform unapproved rollback]

## Site-specific guardrails

- Product claims: [verified claims]
- Prohibited claims: [list]
- Editorial voice: [description]
- Legal/medical/financial restrictions: [list or none]

Approval: [repository owner name or role]
Reviewed date: [YYYY-MM-DD]
## AI-search readiness

Preserve crawlability, canonical, structured-data, sitemap, visible-author/date, internal-link, rendered-text, and accessible-image behavior. If this repository publishes llms.txt, every listed URL must be non-empty, canonical, same-site, and live. Do not add artificial bot-focused chunking, unsupported schema, or ranking guarantees.
