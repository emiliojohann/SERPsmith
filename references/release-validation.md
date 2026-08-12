# Public beta validation

## Product boundary

- Git-backed websites only for v0.1.
- Real site profiles and operational state external.
- Runtime adapter contract documented.
- Unsupported CMS/API targets described honestly.

## Clean environment

- Install the sanitized package from scratch.
- Validate frontmatter and referenced files.
- Load a placeholder profile.
- Run a disposable fixture without real credentials or public mutation.

## Disposable end-to-end fixture

Test:

- inventory and duplicate rejection;
- research evidence capture;
- article package and paired image handling;
- content adapter changes;
- expected diff and secret scan;
- simulated commit/push/deployment;
- simulated Google/Bing/IndexNow results;
- deterministic GA4 property/hostname access, 7/28/90-day snapshots, preceding windows, configured event counts, normalization, immutable output, auth failure, timeout, and cross-site rejection;
- Content Intelligence recommendation states, 7–14 day observation gate, two-snapshot confirmation, explicit owner authorization boundary, and post-change measurement cooldown;
- `scripts/test-search-onboarding.sh`, including ready, action-required, and secret-rejection fixtures;
- `scripts/test-user-onboarding-docs.sh`, including repository instructions and complete Google Cloud/Search Console and GA4 setup;
- `scripts/test-google-analytics.mjs`;
- final report;
- checkpoint resume after interruption;
- completed-run retention dry-run and apply behavior, including protection for the newest three completed runs, incomplete runs, and analytics state;
- prevention of duplicate article, image, commit, sitemap entry, notification, and report.

Inject dirty tree, branch divergence, merge conflict, missing adapter, missing secret, auth failure, rate limit, timeout, provider failure, deployment delay, crawler failure, reporting failure, and malformed content.

## Runtime certification

For each runtime, record:

- version and platform;
- installation method;
- capability mapping;
- manual dry-run result;
- unattended dry-run result when supported;
- resume/failure-injection result;
- guarded-execution build, unit tests, plugin validation, and plugin doctor when using OpenClaw;
- stored per-job allowlist proving raw shell/exec/process tools are absent without changing schedule, timezone, delivery, model, or timeout;
- checkpoint finalizer rejection of incomplete state and acceptance of complete state;
- known limitations.

OpenClaw is the production-tested reference integration. Do not describe Hermes, Claude-based agent environments, ChatGPT agent environments, or another platform as certified until that exact runtime/version passes. Until then use `designed to work; certification pending` and keep unattended use experimental.

## Repository release

- Separate sanitized repository with clean history.
- Explicit license and semantic version.
- README, repository onboarding, Google Cloud/Search Console API onboarding, Bing/IndexNow onboarding, security policy, configuration, adapter reference, compatibility matrix, fixture tutorial, limitations, and release notes.
- Automated secret scan plus manual filename/content review.
- No real domains, private repositories, credentials, identifiers, notification targets, local paths, drafts, reports, state, or generated production assets.
- Inspect the final tree, commit, and release archive before public push.
