# SERPsmith

Multi-platform AI agent support for evidence-led SEO and AI-search-ready publishing on Git-backed websites. Research, draft, create paired images, validate, publish, verify, and notify search engines without mixing sites or duplicating work.

## Start here

New operators read `references/quickstart.md`. Grok Build operators also read `references/grok-build-onboarding.md`. Use `references/agent-runtime-onboarding.md` for runtime capability mapping, `references/repository-onboarding.md` for Git repository connection, `references/site-profile-schema.md` for configuration, `references/search-engine-onboarding.md` for Google Cloud, Google Search Console, Bing Webmaster Tools, and IndexNow setup, `references/image-system.md` for images, `references/runtime-setup.md` for runtime mapping, and `references/troubleshooting.md` for safe stops. Use `references/ai-search-discoverability.md` for AI-search readiness, `references/humanizer-integration.md` for the required portable prose-editing pass and `references/retention.md` for completed-run cleanup. The production read-only Google Analytics 4 extension is documented in `references/google-analytics-integration.md`; use `references/google-analytics-onboarding.md` for setup and verification and `references/content-intelligence.md` for the recommendation observation and authorization lifecycle.

## v0.4 Boundary

Support Git-backed websites through the bundled Markdown/sitemap adapter and reviewed runtime capabilities. Real site repositories remain canonical after publication. Other publishing products and CMS integrations have independent codebases, profiles, policies, tests, and release cycles.

Real profiles, credentials, destinations, drafts, reports, checkpoints, locks, and history stay outside the package. Load exactly one external JSON profile and validate it before target preflight.

## Shared core policy

Current core policy version: `serpsmith-core-v25`.

All active profiles MUST declare the exact `core_policy_version` required by the live validator. Universal behavior belongs to SERPsmith's skill and references, never to an individual site profile.

Profiles may configure site facts, adapters, paths, destinations, schedules, editorial/product guardrails, brand palette, mood, visual preferences, and other explicitly documented site-specific fields. Profiles MUST NOT redefine research standards, image selection or crop-validation rules, attempt/retry behavior, isolation, repository safety, publication gates, notifications, or report structure. `image_direction` is aesthetic guidance only; it cannot impose operational safe zones, pixel coordinates, validation gates, or retry budgets.

Fail closed when a profile contains an unknown `image_policy` or `image_direction` field, operational policy language inside aesthetic configuration, or a mismatched core version. Change universal behavior only through a reviewed SERPsmith skill update that bumps the core version, migrates every active profile, and validates all profiles before any unattended run. The portable Humanizer pass is universal core behavior and MUST NOT be redefined or disabled by a site profile.

## Required capabilities

Manual mode needs filesystem/Git, web research, image generation, local conversion, bounded HTTP, secret access, durable state/locks, and the portable `blader/humanizer` Agent Skill at reviewed version 2.9.1 or newer. Configured GA4 also requires read-only Analytics Admin and Data API access. Unattended mode also needs an external scheduler and final reporting.

Use native runtime tools or separately reviewed adapters following `references/adapter-contract.md`. Never guess credentials, paths, commands, chat targets, or browser locations.

## Isolation and idempotency

Select one site profile and stable slot. Read repository instructions. Namespace state by `site_key`. A run key combines site, slot, and slug. Publish at most one article per run key and resume incomplete checkpoints instead of duplicating articles, commits, links, sitemap entries, notifications, or reports.

## Preflight

Before research or mutation:

1. Run structural JSON profile validation.
2. Follow repository onboarding and verify the repository, branch/upstream, clean tree, instructions, and fast-forward-only state.
3. Verify the configured content paths, image paths, sitemap/discovery paths, deployment behavior, and external state roots.
4. Acquire external per-site/per-slot lock and checkpoint.
5. Stop on dirty/diverged/conflicted state, missing ownership, unresolved placeholders, or unknown destructive state.
6. Verify secret access without printing values.
7. When search integrations are configured, validate exact allowlisted evidence against the selected profile; verify same-site Google property access, Bing verified ownership, the live IndexNow key file, and the sitemap through the standard search-onboarding evidence contract. Return exact user actions for incomplete checks; never guess identifiers or credentials.
8. When `analytics` is configured, run the bundled GA4 check, verify exact property/hostname binding, and load a fresh immutable aggregate snapshot or one no older than one day. Never substitute another property's data.
9. When `ai_search.enabled` is true, verify configured search crawlers and prepare fresh per-article evidence using `references/ai-search-discoverability.md`. A known crawler block is a safe stop before publication; unavailable measurement is disclosed, not invented.
10. Verify that the portable Humanizer Agent Skill is discoverable at reviewed version 2.9.1 or newer. Do not substitute the retired OpenClaw-specific scoring CLI or silently skip the pass.
11. Use bounded known-path checks; never scan broad directories for tools or credentials.

The structural validator does not execute Git, shell, network, image, or credential operations.

## Research and brief

Inventory posts, slugs, intents, dates, links, and recent images. Use verified aggregate GA4 snapshots when configured, Search Console when configured, free SERP signals, and authoritative sources. Record query, intent, evidence, competition signal, site fit, cannibalization risk, sources, and link opportunities. Label demand `directional` unless measured volume exists. Never invent metrics, citations, consensus, or capabilities.

For unattended OpenClaw production, perform web research through bounded browser or full-response adapters invoked by `serpsmith_exec`; do not expose native `web_search` or `web_fetch` in the production job allowlist. Treat a blocked provider or source as structured attempt evidence and continue with another authoritative source when the evidence remains sufficient. Only an exhausted evidence gate may fail the job.

Define title, slug, audience, intent, angle, sources, outline, links, CTA, metadata, excerpt, tags/category, image direction, alt text, and reading time. Use no more than two categories and three tags per article; prefer a smaller relevant set and never add filler taxonomy. Follow the site schema and guardrails. One template-owned H1; body starts at H2 unless configured otherwise. Format every article body H2 and H3 in standard English Title Case, matching established site style; capitalize major words and keep short articles, coordinating conjunctions, and prepositions lowercase unless they begin or end the heading. Use direct authoritative citations, straight ASCII double quotes, and configured link limits. Never diagnose, promise cures, fabricate consensus, or claim unshipped behavior.

## AI-search discoverability and citation readiness

Follow `references/ai-search-discoverability.md` when `ai_search.enabled` is true. AI-search readiness extends normal technical SEO; it does not replace it or guarantee selection, citation, ranking, traffic, or revenue.

Create useful, original, non-commodity content with clear authorship, supported claims, direct answers, descriptive headings, visible dates, crawlable internal links, accurate canonicals and structured data, accessible images, sitemap inclusion, and rendered text. Do not rewrite for bots, add artificial "chunking," manufacture third-party mentions, or create special schema solely for LLMs.

Keep search discovery separate from model training. For ChatGPT Search validate `OAI-SearchBot`; do not treat `GPTBot` permission as equivalent. For Perplexity search validate `PerplexityBot`; user-triggered fetchers are separate. Google AI features use Google's normal Search eligibility and ranking systems. An `llms.txt` file is optional for Google; if a site has one, validate that every listed URL is non-empty, canonical, same-site, and live.

After deployment, collect fresh same-site evidence and run:

    node scripts/ai-search-readiness.mjs PROFILE EVIDENCE

A `verified` result means the configured readiness contract passed. An `action-required` result is a disclosed operational gap, not proof that the article cannot appear in an AI answer. Never collapse evidence into a fabricated universal "LLM score." Prompt citation benchmarks are directional observations only.

## Portable Humanizer pass

After the sourced article draft is complete and before final content validation, invoke the installed `blader/humanizer` Agent Skill in embedded mode and use only its final rewrite. Follow `references/humanizer-integration.md`.

Apply the pass to article prose, not frontmatter, code, structured data, quoted source titles, citations, URLs, link targets, product names, or other exact factual tokens. Preserve every supported claim and never invent facts, names, numbers, dates, quotations, or citations. Preserve SERPsmith's standard English Title Case for article-body H2/H3 headings even though the generic Humanizer treats Title Case as a possible AI pattern. Preserve required SEO terms when removing them would change search intent or accuracy.

The portable skill performs an editorial rewrite, not deterministic authorship detection. Do not manufacture or report a numerical Humanizer score. After the pass, rerun factual, citation, link, metadata, heading, product-claim, and site validation. A missing or incompatible Humanizer skill is a safe stop before publication, not permission to fall back to the retired local CLI or publish without the pass.

## Read-only Google Analytics 4

When `analytics` is configured, use the bundled adapter and exact selected profile. Bind every request and snapshot to the private numeric property ID and exact hostname. Collect aggregate Organic Search landing-page metrics for 7, 28, and 90 days plus preceding windows. Allowed fields are sessions, engaged sessions, engagement rate, active users, page views, aggregate engagement duration, and counts for explicitly configured events.

Never request or persist user identifiers, advertising identifiers, demographics, or individual journeys. Analytics is advisory. Separate observed Search Console evidence, observed GA4 evidence, inference, and recommendation. It does not authorize rewrites, deletions, redirects, CTA/template changes, or schedule changes.

## Content Intelligence observation and authorization

Follow `references/content-intelligence.md`. Store recommendations in private, site-namespaced operational state; never publish or commit the ledger. A newly detected recommendation starts as `observing`, not approved. Observe it for at least 7 days and normally 14 days. Use the longer window for new or low-traffic sites, volatile data, partial tracking, recent deployments, or conflicting Search Console and GA4 signals.

Make a recommendation `eligible_for_owner_authorization` only when the signal appears in at least two comparable evidence snapshots, the proposed action is specific and reversible, and no tracking, indexing, deployment, seasonality, or one-day-spike explanation is more plausible. Time alone never promotes a weak recommendation. If the signal fades or conflicts, keep observing, downgrade it, or close it without action.

Eligibility is not authorization. SERPsmith MUST request explicit owner approval before adding internal links, refreshing copy, changing metadata or CTA copy, or making any other existing-page mutation. Approval must identify the exact URLs and proposed diff. Analytics never authorizes deletions, redirects, major rewrites, product/template changes, tracking changes, schedule changes, or bulk edits.

After one approved change, record its commit and start a 7–14 day `measuring` cooldown before recommending another optimization to the same page. Compare like-for-like windows, label attribution as directional, and report whether the signal improved, worsened, or remained inconclusive. Change one meaningful variable at a time.

## Links

Link the new article to useful existing pages. Add small reciprocal links when natural. Do not re-date or broadly rewrite older content. Record every old-page insertion or report none.

## Images

Follow `references/image-system.md`. Build the brief from article title/focus, query/intent, audience/promise, site `image_direction`, recent image history, and restrictions. Before generation, inventory at least the six most recently published article images when available and classify each image's subject or character, environment, focal object or action, camera perspective or composition, and metaphor or material. Build an explicit recent-image conflict list. Treat loose sheets, document cards, sticky notes, browser-window tiles, clipped page layouts, and floating rectangular panels as one shared paper/card motif even when their colors or layouts differ. If a motif appears in either of the two most recent images or at least twice in the last six, exclude it from both new candidate briefs unless the article genuinely requires that object for three-second clarity; when an exception is necessary, candidate B MUST avoid the motif and the checkpoint MUST explain the exception. Brand-palette continuity is required but never counts as meaningful visual variety. Relative to each of the two most recent images, each candidate MUST vary at least two axes among subject or character, environment, focal object or action, camera perspective or composition, and metaphor or material. Generate two meaningfully different concepts, inspect both, and rank every reviewed candidate. Prefer literal or functional visual connections over poetic abstraction. Apply the three-second clarity test with the exact article title as context.

Review at most six generated candidates per run. Before the limit, reject candidates that fail clarity or required responsive composition and continue with a more direct concept. If none passes every quality gate after six candidates, select the highest-ranked fallback-eligible candidate and continue publication under the existing authorization.

A fallback may have documented clarity, composition, anatomy, or responsive-crop weaknesses, but it MUST remain relevant, coherent, and pass hard publication gates: no unsafe or misleading claim, unrelated destructive signal, generated/pseudo-text, logo/brand, severe meaning-breaking generation defect, missing required asset, or invalid file/MIME/dimensions. Subject clipping, weakened gestures, reduced title clarity, and other aesthetic misses become disclosed quality exceptions after the sixth candidate; they do not stop publication when the image remains recognizable and technically usable. If no candidate is fallback-eligible, stop safely. Record all candidate rankings, the exact exception, and an owner-review recommendation in the checkpoint and final notification.

Default production is an exact 1280 x 720 WebP hero plus a locally derived matching JPEG social image. Focal-crop; never stretch. Inspect original candidates and every required desktop hero, mobile hero, blog-card, and social render. Responsive-crop weaknesses may use the six-candidate fallback whenever the image remains recognizable and technically usable; blank, corrupt, missing, or invalid assets may not. Strip metadata, verify dimensions/MIME, never overwrite, and validate live assets/crawlers.

Use the canonical v25 checkpoint state machine for every external image request. Before calling any image provider, record one `external_requested` transition with a stable operation ID, candidate, bounded requested filename, request timestamp, and deadline. An asynchronous provider response is a hard turn boundary: end the current agent turn while the checkpoint remains `waiting_external`. Provider completion is not publication success. A runtime adapter must correlate exactly one bounded artifact, record `external_completed`, and resume the same run key. Missing, ambiguous, stale, or root-escaping artifacts fail closed.

Keep provider correlation and scheduler behavior in runtime adapters. Follow `references/reliability-contract.md` for the platform-neutral state and reconciliation rules. OpenClaw uses `scripts/openclaw-image-recovery-watch.mjs` and `scripts/openclaw-image-recovery-dispatch.mjs` as the first reference adapter; other agents implement the same capability contract without copying OpenClaw tool names or session semantics. Legacy checkpoint aliases are migration input only and MUST NOT be written by new v25 runs. Never invent or broadly search for a source path, start a second run, duplicate the active request, or let a generic completion lane publish or report.

## Content and target validation

The bundled content adapter is `scripts/markdown-content-adapter.mjs`.

Before commit validate content syntax/schema, headings, slug, metadata, citations, links, images, discovery files, configured AI-search content and crawler readiness, expected diff, allowed checks, staged secrets/private data, and the completed portable Humanizer pass. Do not run prohibited tests or include unrelated changes.

## Publish and verify

Publishing requires explicit per-run approval or recorded site authorization. Create one focused normal commit and push; never force-push. Verify article, canonical, links, metadata, sitemap, assets, crawlers, AI-search evidence, and search adapters. Accepted notification does not guarantee indexing or ranking.

A pre-push failure leaves the article unpublished. After publication, resume only incomplete verification, notification, or reporting.

Validate live HTML semantically where possible. Accept equivalent valid serialization such as attribute-order and closing-tag variations. Use exact literal matching only when the selected site profile explicitly guarantees that template output.

Use the bundled `scripts/live-http-check.mjs` for live endpoint status, MIME, and required-marker checks. It MUST consume the complete response before matching and report transport failures separately from semantic mismatches. Never pipe a live HTTP response into `grep -q`, `head`, or another early-exit consumer; that can close the pipe after a successful match and misclassify curl exit 23 as a network or deployment failure. Download a response completely before any additional local matcher when the bundled adapter does not cover the semantic check.

## Completed-run retention

SERPsmith keeps the published website and its Git history as the canonical content record. It inventories the current repository and live website on every run for slugs, links, sitemap state, and recent published images; completed working directories are not the source of truth for internal linking.

After the final publication report has been successfully delivered, run the bundled retention tool against the selected profile and keep exactly the latest three completed article runs for that site. Within each retained completed run, resolve the checkpoint-selected source image, copy it to the stable `selected-image/source.<ext>` path, verify its hash, and remove every other image candidate, derivative, inspection crop, screenshot, and render from that working directory. Remove the matching transient inspection directory when one is configured. Preserve every incomplete or failed resumable run regardless of age, plus the site-namespaced analytics directory and recommendation ledger.

Use `node scripts/prune-completed-runs.mjs PROFILE --keep 3 --source-root SOURCE_ROOT --transient-media-root MEDIA_ROOT --apply` only after confirmed report delivery. Repeat `--source-root` for each exact external generated-media root that a checkpoint may reference; omit optional roots when every selected source is already inside the checkpoint run. The tool defaults to a dry run unless `--apply` is explicit and fails closed before deletion when a retained run's selected source cannot be resolved uniquely. Record the sanitized cleanup result. Never delete website repositories or their production images, Git history, analytics evidence, locks, active checkpoints, or media outside the exact selected run. A cleanup failure must fail the unattended job without undoing or duplicating the already-published article.

## Retries and safe stops

Persist checkpoints and sanitized attempts externally. Retry only transient timeouts, resets, rate limits, temporary provider/server failures, incomplete responses, propagation delays, reporting outages, or local diagnostic/matcher construction errors that have not changed repository or remote state. Use bounded attempts: initial, about 30 seconds, about 2 minutes, then at most one delayed recovery around 15 minutes when supported.

Classify failures from the actual structured adapter result. A matcher-induced broken pipe, including curl exit 23 caused by an early-exit downstream reader, is a local verification defect rather than evidence of a transport or deployment failure. Correct the matcher and resume the same checkpoint; do not describe it as Hostinger propagation or a network outage.

Never retry secrets/privacy findings, unsafe claims, invalid config, auth/permission/ownership failures, dirty/diverged repos, merge conflicts, malformed content requiring judgment, or unknown destructive state. Preserve state and report the exact next action.

## Concurrent repository recovery

A concurrent repository change is a recoverable coordination event, not permission to abandon a completed article package silently.

When the repository, branch, upstream, or worktree changes after preflight:

1. Stop before commit or push and preserve the checkpoint, lock, article package, assets, and sanitized attempt history.
2. Identify the exact concurrent files and commits. Never overwrite, revert, stage, or absorb unrelated work.
3. Notify the owner immediately with the affected article, safe state, exact conflict/change, and whether automatic recovery is possible.
4. Wait until the other writer has finished or the repository is stable. Do not poll destructively and do not modify another process's files.
5. Once stable, fetch normally, verify the configured branch can be fast-forwarded without conflict, and re-run repository preflight against the new upstream state.
6. Revalidate the preserved publication diff against the new base, including content, images, reciprocal links, discovery files, secret scan, and allowed checks.
7. Resume the same run key from the earliest invalidated checkpoint. Never create a duplicate article, slot, commit, or run.
8. If the preserved changes apply cleanly and every gate passes, complete commit, push, deployment verification, search notifications, and final reporting under the existing publication authorization.
9. If recovery needs conflict resolution, changes product/template behavior, would include unrelated files, or remains unstable after bounded attempts, stop and request explicit owner direction.
10. Never leave a recoverable pre-push package indefinitely. Before ending, either complete recovery, schedule/trigger a bounded continuation in an authorized runtime, or give the owner an explicit blocker and exact next action. A failed delivery attempt must be retried through the configured owner channel or reported by the supervising session.

Record the concurrent change and all recovery attempts in the existing checkpoint. A successful recovery must replace the failed pre-push outcome with the actual publication result while retaining the earlier attempt history.

## Attempt outcome discipline

Before executing a check, classify a nonzero result as either an exhausted gate failure or an attempt-level diagnostic that may be corrected or retried.

### Guarded runtimes

When an unattended runtime supports per-job tool restrictions, remove raw shell, Bash, exec, and process tools from the job. Every shell command, whether expected to pass or potentially recoverable, MUST run through a dedicated guarded execution capability that:

- converts child-process nonzero exits, timeouts, and signals into structured attempt data rather than runtime tool errors;
- suppresses failed-command output from the scheduler while retaining sanitized stage, attempt, status, and exit metadata;
- bounds the working directory, timeout, and captured output;
- provides an intentional exhausted-gate failure capability; and
- provides a finalizer that validates the durable checkpoint before success can be reported.

For the bundled OpenClaw reference integration, use `serpsmith_exec` for every shell command. Set every `serpsmith_exec` `cwd` to a directory inside the Guard plugin's configured `allowedRoots`; when the selected site repository lives outside those roots, use an allowed workspace directory as `cwd` and enter the approved repository inside the guarded command. Verify this boundary during repository preflight so a routine policy rejection cannot poison the scheduler trajectory. Use `serpsmith_fail` only after a non-retryable or exhausted gate. Before the final success response, call `serpsmith_finalize` with the authoritative checkpoint path. The cron tool allowlist MUST include only the file, image, messaging, and SERPsmith guard tools required by the run and MUST exclude native `web_search` and `web_fetch` plus raw `exec`, `bash`, `shell`, and `process`. A prose instruction is not enforcement; do not call the OpenClaw integration installed until the live job allowlist proves those raw tools are absent.

A stored job allowlist is not proof when the selected agent harness can expose native tools outside OpenClaw's registry. Production unattended jobs MUST run in a runtime where the job allowlist controls the complete callable tool surface. Record the effective agent runtime and inspect a real validation trajectory: it MUST contain `serpsmith_exec` calls and MUST NOT contain raw `exec`, `bash`, `shell`, or `process` calls. If a base tool profile removes the guard plugin before the job allowlist is applied, use a dedicated operator-controlled agent profile that exposes the plugin, then keep each production job restricted by its exact `toolsAllow`. Do not broaden the owner's normal agent runtime or tool profile.

### Portable wrapper fallback

On a runtime that cannot restrict job tools but can execute shell, every command whose nonzero result may be retried, reinterpreted, calibrated, or replaced MUST be invoked as `/bin/zsh /absolute/path/to/scripts/controlled-attempt.sh STAGE ATTEMPT REASON -- COMMAND [ARG ...]`. This includes Git fetch or other preflight probes, matcher construction, expected alternate paths, secret-scan calibration, metadata probes, deployment polling, live verification, and notification retries. Never execute the wrapper path directly or rely on its filesystem executable bit.

The wrapper fallback suppresses failed-command output and returns a structured `SERPSMITH_ATTEMPT` result, but it does not prevent an autonomous agent from bypassing the wrapper. Do not describe wrapper-only unattended containment as enforced. Prefer manual mode when the runtime cannot remove raw execution and reliable scheduler status is required.

Do not use fail-fast shell behavior inside retryable checks. Do not reproduce either guard inline. Record structured results in the sanitized attempt log. A passed attempt confirms only that attempt; the durable checkpoint remains authoritative.

After the permitted attempts, reread the checkpoint. If the gate is still incomplete, emit one explicit exhausted-gate failure with the stage, attempts, safe state, and next action. Immediately non-retryable failures may fail directly. A recovered attempt remains in the log but must never override a completed checkpoint or successful final report.

Before reporting success, confirm every required publication, live-verification, and notification gate is complete. Record `report_prepared`, validate the pre-delivery checkpoint, send through the configured notification adapter, then record `report_acknowledged` with the adapter's non-secret receipt. Run the completion finalizer only after acknowledgment. A prepared or sent report is not complete without an acknowledgment, and a scheduler result never overrides checkpoint state. Never convert a genuinely exhausted failure into success merely to silence scheduler alerts.

Before unattended release, validate the selected integration. For the OpenClaw reference integration, run the guard plugin build, unit tests, plugin validation, plugin doctor, and a real isolated scheduler validation that executes one failing command and one passing command through `serpsmith_exec`, calls `serpsmith_finalize` against a complete checkpoint, finishes with scheduler status `ok`, and confirms the recorded trajectory contains no raw execution tools. Inspect the live production cron payload to prove its tool allowlist excludes raw execution. For the portable fallback, run `/bin/zsh scripts/test-controlled-attempt.sh`; the regression must verify both failing and passing commands through a non-executable copy of the wrapper.

## Manual and unattended modes

Onboard manually: follow `references/repository-onboarding.md`, `references/agent-runtime-onboarding.md`, and `references/search-engine-onboarding.md`, produce a profile-bound sanitized search-onboarding report, run read-only preflight, then continue with research/brief review, article/image review, diff review, explicit publish approval, and live verification. Only the owner can authorize unattended mode externally. Authorization never includes product/template changes, force pushes, conflict resolution, credential changes, unrelated edits, cron changes, or bypassing gates.

## Portability and reporting

SERPsmith provides multi-platform AI agent support through the adapter contract. The agent environment must provide the required tools; chat-only agents or environments missing required capabilities cannot automate the workflow. Keep every platform's test status accurate: OpenClaw is the production-tested reference integration, while Hermes, Grok Build, Claude-based agent environments, ChatGPT agent environments, and others remain certification-pending until their exact setup passes the documented tests. Report title/URL, time/timezone, keyword evidence, metrics when available, configured AI-search readiness without a fabricated score, portable Humanizer version/result without a fabricated score, old-page changes, images/crawlers, notifications, commit/deployment, and failures/recovery. Never expose secrets, credential paths, private identifiers, or secret-bearing URLs.

Keep Telegram publication reports about 50% shorter than the legacy sectioned format. Use plain text with no blank lines and at most eight nonblank lines on success:

Published: <article title>
<link>
Time: <local time/timezone> | <configured secondary time/timezone>
Evidence: <keyword label>; Analytics: <one short aggregate finding when configured>
Checks: Humanizer <result>; AI search <readiness>; image <standard or exact fallback exception>; old-page changes <summary>; live <verified>
Commit: <short hash>
Search: Google <status> | Bing <status> | IndexNow <status>
Note: <only a material exception, recovery, limitation, or owner action; otherwise omit>

Do not list image filenames, dimensions, routine crawler details, or boilerplate limitations when their checks passed. Keep failure reports to at most five nonblank lines: Failed, Stage/attempts, Completed, Safe state, and Next action. Preserve every required checkpoint and verification detail in durable state even when omitted from Telegram.

For unattended OpenClaw delivery, prepare the final report, record `report_prepared`, and call `serpsmith_finalize` in pre-delivery mode. Then make one explicit `message` call to the configured owner destination with plain text only: no attachments, media, generated-image references, or file paths. Record `report_acknowledged` with the non-secret message receipt and call `serpsmith_finalize` in complete mode. Only then run retention and return `NO_REPLY`; fallback announcement remains disabled. Do not delete generated sources before acknowledgment.
