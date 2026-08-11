# Configuration

SERPsmith separates the reusable workflow from site profiles, credentials, runtime adapters, and operational state.

## Site profile

Each publication run selects exactly one profile. A profile should define:

- stable site key;
- repository location and branch;
- public base URL and article route;
- post data or content location;
- image directory;
- sitemap and optional LLM discovery files;
- verified Search Console property;
- verified Bing site URL;
- optional exact GA4 property/hostname binding, standard windows, organic channel, and verified aggregate event names;
- IndexNow host and public key-file readiness state;
- deployment behavior;
- site-specific factual, legal, medical, product, and editorial guardrails;
- whether unattended publishing is approved.

Follow `repository-onboarding.md`, then use the placeholder profiles in `examples/` as a starting point. Store real profiles outside the repository.

## Runtime adapters

The host environment should provide adapters for:

- web research;
- Search Console reads and sitemap submission;
- read-only GA4 property verification and aggregate snapshots when configured;
- Bing ownership checks and sitemap submission;
- image generation and local WebP/JPEG conversion;
- filesystem and Git;
- deployment verification;
- scheduling;
- messaging or reporting;
- IndexNow ownership-key verification and URL submission;
- optional prose analysis.

Optional adapters must not block the core manual workflow.

## Private state

Store these outside the repository:

- stable run keys and checkpoints;
- retry attempt logs;
- planned publication slots;
- used topics, slugs, and URLs;
- drafts and research evidence;
- image prompts and approval records;
- deployment and notification results;
- performance checkpoints.

Maintain separate state per site. One site's topic history, failures, or scheduled jobs must never affect another.

## Credentials

Load credentials from environment variables or an external secret manager. Never place real secrets in Markdown examples, site profiles committed to Git, command history captured in reports, or notification messages.

GA4 uses Viewer access only. The runtime passes a reviewed credential file reference directly to the adapter; numeric property IDs stay in private external profiles. Follow `google-analytics-onboarding.md`.

Minimum privilege is preferred. A Search Console credential should receive access only to the properties it needs. Bing credentials should be limited to the verified sites they operate. The IndexNow key is a public verification value served by the website. Keep its raw value out of profiles, evidence, chat, and reports; configure an explicit reviewed key-file path.

## Repository onboarding

Use `repository-onboarding.md` to connect the repository, establish the SSH/credential boundary, document the write branch, map the content adapter, record safe validation commands, and create the site-owned repository instruction file from `templates/site-repository-instructions.md`.

## Search-engine onboarding

Use `search-engine-onboarding.md` for the user-facing setup sequence. Store only public identifiers in the profile. Store sanitized readiness evidence outside the repository and evaluate it with `scripts/search-onboarding-report.mjs`.

A manual publishing workflow may skip integrations that the profile does not require. Unattended publishing must not start until every integration marked required reports `ready`. A failure report must identify the specific Google, Bing, IndexNow, or sitemap action the user must complete.

## Scheduling

Use separate publication jobs per site. A shared planner may create those jobs, but each publication must have its own stable run key, checkpoint state, retry budget, and final report.

Stagger multi-site jobs to avoid overlapping repository operations or exhausting shared providers.
