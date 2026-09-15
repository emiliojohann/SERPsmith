# Changelog

## v0.5.0-beta.8

- Assigned one owner to asynchronous image completion so publisher callbacks cannot race the durable watcher.
- Made matching stale image tickets settle silently and resume once from the current checkpoint revision.
- Added ten-minute revival for completed-image checkpoints stranded without queued or active work.
- Sealed operation identities across every queue state and added regression coverage for the full race.

## v0.5.0-beta.7

- Made explicit owner image rejection feedback a required, read-back-verified completion gate for scheduled and post-publication replacements.
- Added exact rejection verification so a replacement cannot proceed from chat or daily memory alone.
- Added regression coverage for detailed physical-realism feedback and repeated concept-family exclusion.

## v0.5.0-beta.6

- Normalized canonical v27 image candidate labels so both `A` and `candidate-a` resume through the same durable watcher path.
- Added regression coverage for the candidate label used by site adapters.

## v0.5.0-beta.5

- Resolved selected-source evidence from canonical v27 completed image operations.
- Added regression coverage for v27 checkpoints whose selected source is stored in `pending_operation.artifact`.

## v0.5.0-beta.4

- Fixed completed-run retention so canonical v27 checkpoints and legacy checkpoints are classified together.
- Added deterministic selected-image recovery for migrated runs that already contain one stable source or one unambiguous candidate.
- Added mixed-format retention regression coverage.

## v0.5.0-beta.3

- Removed development-environment terminology from the distributable documentation.
- Added a release-boundary regression that rejects internal release wording from exported runtime packages.
- Required distribution and installed-runtime promotion to use the same checksum-verified artifact.

## v0.5.0-beta.2

- Separated development tests from the distributable runtime manifest and added a regression that rejects test-like export paths.
- Added a generic leased worker harness with exact site, run, checkpoint, and revision binding.
- Added bounded reliability intelligence that learns recurring failure signatures continuously and produces approval-only owner recommendations.
- Added 28-day evidence thresholds, weekly review support, decision memory, and bounded 180-day telemetry retention.

## v0.5.0-beta.1

- Added a deterministic stage controller that derives the next action exclusively from canonical checkpoint state.
- Added a durable filesystem work queue with atomic leasing, bounded retries, lease expiry recovery, and terminal exhaustion.
- Added two-phase report delivery intent so an interrupted send becomes an ambiguous state requiring reconciliation instead of an automatic duplicate.
- Added immutable Google Search Console snapshots and approval-gated 7/14/28/90-day article milestone observations.
- Added a private owner image-feedback ledger so repeatedly rejected concept families are excluded from future candidates.
- Added failure-injection coverage for worker interruption, lease expiry, retry exhaustion, and report-delivery ambiguity.

## v0.4.0-beta.5

- Removed internal release-policy and checksum artifacts from the distributable repository.
- Added release-boundary regression coverage so unwanted public files and placeholder changelog headings cannot return.

## v0.4.0-beta.4

- Upgraded the Guard test toolchain to Vitest 5.0.0, removing the vulnerable `@vitest/mocker` dependency and clearing the related path-traversal advisories.
- Kept the Guard runtime contract at 0.2.0; this maintenance release changes development and verification dependencies only.

## v0.4.0-beta.3

- Advanced the shared policy from `serpsmith-core-v18` to the platform-neutral `serpsmith-core-v25` contract.
- Added canonical versioned checkpoints, atomic revision-checked transitions, scheduler-independent reconciliation, runtime capability certification, and acknowledged-report completion.
- Added OpenClaw Guard 0.2.0 with runtime admission, contained attempt failures, and two-phase pre-delivery/completion finalization.
- Rebuilt OpenClaw asynchronous image recovery around checkpoint-bound, isolated per-event jobs with normalized candidate and refinement correlation.
- Added deterministic image-operation IDs and deadlines so provider or scheduler success cannot be mistaken for publication success.
- Hardened unattended research and command execution around restricted tool surfaces and Guard-approved working roots.
- Hardened completed-run retention to keep only the latest three completed runs per site and one hash-verified selected source image per retained run.

## v0.4.0-beta.2

- Advanced shared policy to `serpsmith-core-v18` and migrated the bundled validator and example profiles.
- Fixed guarded report finalization so canonical completion gates are validated before delivery and delivery is recorded only after confirmation.
- Added a hard asynchronous image-generation turn boundary for unattended OpenClaw runs to prevent duplicate generation and unsafe continuation.
- Reclassified matcher-induced broken pipes separately from real transport and deployment failures.
- Shortened unattended Telegram success and failure reports while preserving full durable checkpoint evidence.
- Added Grok Build onboarding with certification-pending compatibility language.

## v0.4.0-beta.1

- Added a six-image visual-motif inventory and rotation budget for article artwork.
- Grouped loose sheets, document cards, sticky notes, browser-window tiles, clipped layouts, and floating rectangular panels as one paper/card motif so cosmetic changes cannot pass as variety.
- Required every new candidate to vary at least two major visual axes from each of the two most recent images while preserving the site's brand palette.
- Fixed the AI-search readiness entrypoint syntax error so resumable post-publication verification can execute.
- Enforced a universal maximum of two categories and three tags per article.
- Released the evidence-based AI-search/AIO readiness, GA4 Content Intelligence, portable Humanizer, guarded execution, search onboarding, and retention capabilities as one Git-backed beta package.
- Advanced shared policy to `serpsmith-core-v14`.

## v0.2.0-beta.1

- Added evidence-based readiness for Google AI features, ChatGPT Search, and Perplexity search.
- Added deterministic crawler, technical, content, measurement, and optional llms.txt checks.
- Distinguished search-discovery crawlers from training and user-triggered bots.
- Prohibited artificial LLM chunking, unsupported schema, fabricated visibility scores, and ranking guarantees.
- Kept Git publishing unchanged and advanced to `serpsmith-core-v10`.

## v0.1.0-beta.4

- Added safe per-site completed-run cleanup that retains the latest three completed article runs while protecting resumable runs, analytics snapshots, and recommendation state.
- Cleanup runs only after confirmed final-report delivery and defaults to dry-run unless explicitly applied.
- Documented that the website repository, sitemap, live site, and production images remain canonical for article inventory and internal linking.
- Advanced shared policy to `serpsmith-core-v9`.

## v0.1.0-beta.3

- Added clear multi-platform AI agent support and compatibility status.
- Labeled OpenClaw as the production-tested reference integration and other platforms as designed to work with certification pending.
- Added the Content Intelligence recommendation observation lifecycle.
- Requires 7–14 days and at least two comparable snapshots before a recommendation may become eligible for owner authorization.
- Added an explicit approval boundary for internal links, small refreshes, metadata, CTA copy, and all other existing-page mutations.
- Added a 7–14 day post-change measurement cooldown and named CTA instrumentation guidance.

## v0.1.0-beta.2

- Added production read-only GA4 property/hostname verification.
- Added immutable aggregate Organic Search snapshots for 7/28/90-day and preceding windows.
- Added configured event counts, site isolation, onboarding, fixtures, and failure tests.
- Advanced shared policy to `serpsmith-core-v7`.

## v0.1.0-beta.1

Initial public beta candidate.

- Git-backed Markdown reference workflow.
- External JSON site profiles.
- Structural profile validation.
- Markdown article and simple XML sitemap adapter.
- Evidence-led research, image direction, safe publication, checkpoint, retry, and reporting rules.
- OpenClaw field-test documentation.
- Experimental Hermes and other-agent portability guidance.

Known limitations:

- CMS APIs are not supported.
- Non-Markdown repository layouts require custom adapters.
- Bing, IndexNow, image conversion, scheduling, deployment, and reporting depend on runtime or separately reviewed adapters.
- Cross-agent compatibility claims remain experimental until runtime-specific dry runs pass.
