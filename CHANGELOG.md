# Changelog

## v0.8.0-beta.1

A rebuilt SERPsmith application for researched blog publishing.

- A shared durable workflow for independent manual requests and per-blog calendars.
- Source-grounded research, drafting and fact-checking, with verified product claims and contextual links.
- Lead-first articles, TL;DR summaries, five FAQ pairs and matching structured data; optional category and breadcrumb integration.
- Editorial artwork with bounded fallback routes, durable spending records and explicit image-only authorizations.
- Git-based publication, public-page verification and recovery that preserves accepted and uncertain effects.
- Search submissions, completion messages, selective follow-ups and consolidated review reminders.
- Cleanup of full working articles and artwork after verified publication, while retaining compact operational metadata.

### Beta requirements and limitations

- Configure a compatible Hermes installation, external accounts and a supported website integration before publishing.
- Dedicated image API authentication currently requires macOS Keychain. Subscription fallback requires compatible authenticated Hermes capabilities.
- Supported PHP and Next.js layouts require integration; installation does not convert arbitrary websites, install category pages or start a background service.
- Search-submission acceptance is not indexing confirmation. Local checks do not establish live provider availability or unattended-operation reliability.
- Review [setup and usage](README.md) and [operating instructions](SKILL.md) before execution. Installing this version does not migrate or activate an existing installation automatically.
