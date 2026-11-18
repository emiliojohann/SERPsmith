---
name: serpsmith
description: "Use when publishing researched blog articles with SERPsmith."
---

# SERPsmith operating instructions

Use the installed `serpsmith` CLI and the application's shared Store/pipeline for manual and scheduled publishing. See [setup and capabilities](README.md). Resolve the runtime root from `--home` or `SERPSMITH_HOME` (default `~/SERPsmith`); keep all clients on the same root. Do not create a separate agent-owned publisher or spending ledger.

## Establish scope and readiness

- Honor the user's named blog, topic and authorized effects. Observation, article execution, image generation and image deployment are different scopes. A status request does not authorize `run`, `retry` or `tick`.
- Use `serpsmith status` for job/calendar/publication summaries. `serpsmith doctor` checks local setup only, not live provider authorization, deployment, search or messaging. These commands may initialize local storage; do not treat them as filesystem-read-only probes.
- `serpsmith blogs add` guides terminal setup; `serpsmith blogs add --file FILE` supports noninteractive onboarding. Keep blog configuration, credentials, destinations, databases and working material private. Avoid publishing full blog listings or raw job/configuration payloads.
- Confirm website compatibility before execution. The PHP and Next.js publishers require their supported registry/template layouts, configured Git target and working external deployment. Setup does not convert arbitrary templates or install category archives. A successful local check is not live qualification.

## Manual publication

For an authorized article execution:

```sh
serpsmith run --blog BLOG --topic 'Requested topic' --request-key STABLE_REQUEST_ID --publish
```

Reuse that key when continuing the same request; use a new key for a genuinely new article request. Without a key, another `run` creates another job. Resume an existing job with:

```sh
serpsmith retry JOB_ID --publish
```

Without `--publish`, these commands do not research, spend, publish or send messages; they are not a preview-generation mode. With it, the entire pipeline may perform external effects. Manual jobs are independent of automatic calendar pauses, run any day/time and do not consume scheduled slots.

Preserve pending, accepted and unknown effect identities. Never delete effects, reset image charges or create another job to obtain a cleaner outcome. If publication or delivery may already have occurred, reconcile the original target before retrying.

## Editorial contract

- Use fetched source passages, not search snippets or invented citations. Treat analytics as advisory only. Do not fabricate facts to keep an unsupported topic.
- Require factual private `product` name, description, HTTPS URL and `verified_capabilities`. Use only verified capabilities in product claims; do not add medical or other unsupported promises.
- New articles use prose, simple bullets or numbered lists, not Markdown/HTML tables. Preserve meaningful comparisons and qualifications. Genuine inline/fenced code is not table prose. Do not rewrite accepted articles to enforce new-draft rules.
- Start body prose with a useful lead, not a duplicate title. Include contextual internal links to observed real pages and a topic-specific product connection before FAQ and Sources. Render every external body/Sources link with `nofollow noopener noreferrer`.
- Keep `tldr` and `faq` separate from `body_markdown`: plain-text TL;DR of 1–600 characters and exactly five distinct FAQ pairs, each containing only `question` (1–240 characters) and `answer` (1–1200). No markup, links, blank values or near-duplicate questions. Humanize and fact-check these alongside the body; structural checks do not prove factual accuracy.
- Use renderer-owned escaped markup. Put the TL;DR below article navigation and before prose, styled from the site's author box. Put the FAQ immediately before Sources, after the product closing, styled from the site's homepage FAQ with a left-aligned article H2. Visible FAQ copy and FAQPage schema must agree.
- Preserve accessible single-open FAQ behavior and reduced-motion handling. Use content-addressed same-origin CSS/JS and the PHP nonce-aware runtime hook where applicable. Preserve CSP and security headers; never weaken them to pass verification. Delivered markup/assets alone are not visual acceptance or rich-result eligibility.
- Categories are opt-in through private `publisher.category_navigation`: exactly five allowed slug/label pairs and one allowed primary label per new article. Verify the site's allowlist, real archives, compact Home > Blog > Category breadcrumb and matching BreadcrumbList/BlogPosting schema. Current compact verification expects `/blog/category/<slug>/` archive links. Do not invent fallback labels, transplant another blog's taxonomy or change existing article URLs.

## Artwork and image-only requests

Follow the fixed dedicated OpenAI 2.6 API → dedicated OpenAI 2.5 API → Hermes-managed Codex subscription route order. Dedicated API keys require macOS Keychain; subscription fallback requires a compatible authenticated Hermes image provider. Do not change global provider configuration or use the image key for research.

Automatic artwork shares the original job's four-attempt maximum and article/monthly admission budgets. Failed, pending and unknown attempts remain charged. Honor private image dimensions, theme, palette, requirements and feedback; inspect actual pixels when image review is requested. Do not invent repeated paid aesthetic iterations. A configured hash-bound default is an explicit fallback, not a newly generated candidate.

An explicitly requested image-only candidate uses the original job and actual user approval through operator APIs, not a nonexistent CLI subcommand:

```python
authorization = store.authorize_manual_image(
    original_job_id, stable_request_key, approval_reference
)
receipt = images.generate(
    blog, article, workdir, store, original_job_id,
    correction_key=stable_correction_key,
    manual_request_id=authorization['id'],
)
```

Here `store` is the shared application Store and `images` is `serpsmith.images`; resolve blog/article/workdir in the authorized runtime context. One authorization permits one successful candidate through at most three distinct routes. Its budget cannot exceed the configured article cap; shared monthly accounting still includes it. Reuse the same authorization/effect on resume. A genuinely new user request may authorize another candidate; it does not erase earlier charges. Automatic corrections without manual authorization remain in the original automatic bucket.

`images.generate` accepts text-only generation, not reference-image edits. Do not pass unsupported reference arguments or silently substitute text-only generation for a localized edit. Report this limitation when it blocks the requested work. Generation does not approve or deploy a replacement: obtain the required scope, preserve article prose/URL, verify the exact replacement and do not rerun research or search submissions just to change artwork. After publication cleanup, retrieve accepted content from the site/repository rather than regenerating it.

## Scheduling and reminders

Enable approved calendars with `serpsmith schedule resume --blog BLOG` and `serpsmith schedule resume`. Pause with the corresponding `pause` commands. These only change calendar switches; they do not register a background service. Use one separately supervised `serpsmith service --publish --interval 60`, not a competing agent cron publisher.

`tick --publish` admits today's due local-time slot with repeated-slot deduplication, including repeated daylight-saving times; it does not backfill older dates. `tick` without `--publish` can still queue jobs. Use `status`, not `tick`, to inspect without admitting work.

Published-job follow-ups and due reminders run with `--publish` independently of article-calendar pauses. Stop the service to halt all service-driven effects. `reminders_enabled: false` disables automatic reminder delivery, not article execution.

`serpsmith reminders` lists consolidated due metadata. `serpsmith reminders --send --publish` explicitly delivers; `serpsmith reminders --ack KEY` acknowledges operator handling without claiming a send. Default check-ins are at 30/60/90 days, skip unknown publication dates and never rewrite content. Unknown/pending sends require reconciliation rather than replay.

## Recovery and completion

- After a crash, confirm the old worker is stopped before `serpsmith recover JOB_ID --confirm-worker-stopped`; it releases the lock without erasing effects. Resume the original job with `retry`.
- A commit/push is not verified publication. Verify the exact public canonical, article content, assets and required schema/security properties. Keep uncertain publication intent and work available for reconciliation; never blindly push again.
- After verified durable publication, the pipeline removes full article/research/image state and the job checkout/work directory. Keep compact publication/effect/accounting metadata, not an archive of recent drafts. Ordinary deletion is not forensic secure erasure and does not clean external provider caches/backups.
- Repair post-publication failures through URL-only follow-ups. Google receives a Search Console sitemap submission, Bing the article URL and IndexNow a URL notification. Finite retries target explicit failures; missing configuration waits for a detectable change. Never replay accepted/unknown submissions or republish to repair reporting.
- Report the title, one verified live URL, plain-language Google Search Console/Bing/IndexNow outcomes and any actionable exception. Acceptance is not indexing, rankings or traffic proof. Hermes acknowledgment is not recipient readback. If the pipeline already delivered the completion message, do not send a duplicate report.
- `followup_required` can describe an already-live article with unfinished search/messaging. Distinguish generated, committed, pushed, publicly verified and delivered states. State unresolved beta/integration limits plainly; never claim universal provider or unattended-site support.
