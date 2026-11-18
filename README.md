# SERPsmith

SERPsmith is a Hermes-first application for researched blog publishing. It combines source-backed research, drafting and fact-checking, editorial artwork, Git-based publication, public-page verification, search submissions and completion messages in one durable workflow. Manual requests and scheduled articles share the same job store and spending controls.

**v0.8.0-beta.1** is a beta: website integration and configured external accounts are required. Installation does not start publishing, register a background service or modify a website. See [agent operating instructions](SKILL.md) and the [license](LICENSE).

## Install

Use Python 3.11+ in a dedicated virtual environment. From the source repository root, with that environment activated:

```sh
python -m pip install .
# Alternative: install into an existing environment with uv.
uv pip install --python /path/to/venv/bin/python .

serpsmith --help
serpsmith init
serpsmith blogs add
serpsmith doctor
serpsmith status
```

Git and a compatible, authenticated [Hermes Agent](https://hermes-agent.nousresearch.com/docs/) CLI must be available. Hermes is an external application, not an embedded or pinned SDK. Research uses its configured account/model and web search/extraction tools; messaging and subscription artwork need their own configured Hermes capabilities. Installing SERPsmith does not configure those accounts.

The runtime root defaults to `~/SERPsmith`. Set `SERPSMITH_HOME` or put `--home /path/to/runtime` **before** the command to select another root. Use the same root for every client and service. Keep it outside the source repository. Initialization preserves existing settings; global automation and new blogs' schedules start disabled.

## Configure a blog

`serpsmith blogs add` guides terminal onboarding. Agents and noninteractive callers use `serpsmith blogs add --file /path/to/blog.json`; existing blog IDs are not overwritten. `serpsmith blogs list` shows configured blogs, including private configuration, so do not paste its output into public reports.

Runtime configuration lives in `settings.json` and `blogs/<id>.json`. Each blog requires:

- An ID, public HTTPS URL, local Git repository, deployment branch and remote.
- A publisher: `php-posts-data` or `nextjs-tsx-blog-registry`, with a repository-relative `posts_file`.
- A timezone and `schedule` with `weekdays` (Monday=0 through Sunday=6) and local `time` such as `08:00`.
- Factual `product` fields: `name`, `description`, HTTPS `url` and a nonempty `verified_capabilities` list. These bound product claims before paid work.

Optional editorial configuration includes audience, topics, guardrails and internal-link requirements. The blog's `image` object supplies dimensions, theme, palette, requirements and `feedback`. `notifications` accepts a Hermes `target` and optional `profile`/`hermes_command`; this messaging profile does not select the research profile.

### Website integration

The two publishers support specific PHP data and Next.js TSX registry layouts, **not arbitrary websites**. Guided onboarding is a starting configuration, not automatic template conversion. Adapt and review the site's registry, article template, asset paths and deployment process before authorizing publication. Publisher configuration can supply `image_directory`, `public_directory`, `articles_directory`, `article_route`, sitemap and discovery-file paths as appropriate to the layout.

SERPsmith clones the deployment remote into a job-scoped checkout, commits only the article's declared files and pushes the configured branch. The website's existing deployment process must make that commit publicly available. Configure Git authentication separately, without credentials embedded in remote URLs. Read-only preflight checks the registry and remote branch before research/image spending; it does not prove push permission or successful deployment.

New articles include a TL;DR styled from the site's author box and five accessible FAQ accordions styled from its homepage FAQ, with matching FAQPage JSON-LD. Their CSS and progressive FAQ JavaScript are content-addressed, same-origin assets. PHP integration needs the nonce-aware FAQ runtime hook (`SERPSMITH:FAQ-RUNTIME`) in the configured template. Preserve CSP and security headers; do not enable unsafe inline content to bypass an integration failure. Delivered assets and valid schema alone do not prove browser appearance or search rich-result eligibility.

### Categories and breadcrumbs

Opt in with private `publisher.category_navigation`: `categories` maps exactly five stable slugs to five distinct primary labels, and `route` specifies the archive pattern. The current compact breadcrumb verifier expects `/blog/category/<slug>/` archives. Optional `taxonomy_file` and `taxonomy_format` (`php` or `json`) compare a literal site allowlist with this configuration.

Each new article must choose exactly one allowed label. The website must already implement the category archives, visible **Home > Blog > Category** trail above the TL;DR, matching BreadcrumbList and BlogPosting `articleSection`. Enabling the option does not create navigation or convert templates. Keep existing article URLs unchanged; unconfigured blogs are not assigned this taxonomy.

## Private configuration and security

Keep credentials, account/site identities, runtime databases, working material and notification destinations out of source control and public reports. Restrict runtime access to the application user. Configuration written by SERPsmith uses private file permissions; protect manually created files and backups too.

- Dedicated image API authentication currently uses **macOS Keychain**, service `serpsmith-openai-images`, account `serpsmith`. Store the key securely there; there is no portable environment-variable image-key fallback.
- Google authentication uses `private/google-service-account.json` under the runtime root. Grant that service account the required Search Console/analytics access separately.
- `private/search-credentials.json` accepts `bing_api_key` and `indexnow_key`, or corresponding `*_keychain` objects with `service` and `account`. Per-site IndexNow keys can live under `sites.<blog-id>`. Keychain references require the macOS `security` tool.
- Blog `search` settings include `search_console_property`, `sitemap_url`, `bing_site_url` and `indexnow_key_location` as needed. The IndexNow key file must be hosted on the configured site; SERPsmith does not provision it.

`doctor` checks local dependencies, configuration, paths and credential/target presence. It does **not** verify live account authorization, provider availability, deployment, search acceptance or message delivery. Do not expose raw configuration or error payloads while diagnosing a failure.

## Manual articles

```sh
# Queue only: no research, image spending, publication or messages.
serpsmith run --blog BLOG --topic 'An evidence-led topic' --request-key REQUEST_ID

# Execute the authorized request, including external effects.
serpsmith run --blog BLOG --topic 'An evidence-led topic' --request-key REQUEST_ID --publish

# Resume the same job.
serpsmith retry JOB_ID --publish
```

`--publish` authorizes the full pipeline, including model/provider calls; it is not just a final website-write switch. Without it, `run` creates/reuses a job and `retry` returns the existing job without executing it. This is not a draft-preview mode. Omit `--topic` to let research select a topic from the blog's context.

Reuse a stable `--request-key` for the same request. Without a key, every manual `run` creates a new job. Manual requests work any day/time, even when automatic calendars are paused; they do not consume scheduled slots.

Research uses fetched source passages rather than snippets alone. New drafts use prose and lists instead of Markdown/HTML tables, start with a useful lead, include contextual links to real internal pages and finish substantive prose with a factual, topic-specific product connection. A plain-text TL;DR and exactly five distinct plain-text FAQ pairs accompany the body, with FAQ immediately before Sources. External body and Sources links receive `nofollow noopener noreferrer`. Structural validation and model fact-checking do not guarantee factual accuracy; review the editorial policy and published result.

## Scheduled operation

```sh
serpsmith schedule resume --blog BLOG
serpsmith schedule resume
serpsmith tick --publish

# Foreground loop; register separately with your operating system if wanted.
serpsmith service --publish --interval 60

serpsmith schedule pause --blog BLOG
serpsmith schedule pause
```

New scheduled articles require both global automation and the blog's calendar to be enabled. `schedule` changes those switches only; it does not install a service. Run one scheduler against the shared runtime root, not a second agent-owned publishing loop.

A tick admits today's due local-time slot, not older missed dates. Slot identity deduplicates repeated ticks and daylight-saving repeated clock times. Safe pre-publication failures have bounded delayed retries. `tick` without `--publish` can still create queued scheduled jobs when calendars are enabled; it is not a read-only status check.

With `--publish`, ticks also process safe post-publication follow-ups and due reminders **even when article calendars are paused**. To prevent all further service-driven effects, stop the service; calendar pause alone is insufficient. `settings.json` can disable automatic reminder delivery with `reminders_enabled: false`.

## Artwork and spending

Artwork tries the configured fixed route order: dedicated OpenAI 2.6 API, dedicated OpenAI 2.5 API, then the Hermes-managed Codex subscription image provider. Availability, entitlement and compatible Hermes/plugin contracts are prerequisites, not guarantees. The application does not switch global Hermes providers.

Automatic artwork shares a maximum of four attempts per article across initial and correction work. Defaults are a $2 article admission cap and $50 UTC-month cap, configurable in `settings.json`. Failed, pending and unknown attempts remain charged conservatively. Reservations estimate cost; they are not a provider-enforced billing ceiling. An optional site-default fallback must be explicitly configured with a matching hash; it is not silently substituted for a personally requested new image.

Image-only requests use operator APIs, **not an image CLI command**. A trusted operator records explicit approval with `Store.authorize_manual_image` on the original article job and passes its returned ID as `manual_request_id` to `images.generate`. One authorization permits one successful candidate through at most three distinct routes, with a separate bounded budget and the same monthly accounting. Reuse the authorization on resume; never reset prior charges or create a replacement article to bypass limits. `images.generate` is text-only; reference-image editing is not exposed by this API. Generation does not itself approve or deploy an image-only replacement.

## Recovery, search and retention

The runtime's `data/serpsmith.sqlite` holds jobs, effect identities, locks, image accounting and a compact publication index. Temporary research, articles, artwork and isolated checkouts live in `work/<job-id>/`.

- Publication intent is recorded before dispatch. Retry reconciles saved intent/commit and verifies the public target; unresolved outcomes stop rather than blindly publishing twice. A Git push alone is not verified publication.
- After a crash, confirm the prior worker has stopped before using `serpsmith recover JOB_ID --confirm-worker-stopped`. This releases the lock only; it preserves effect and spending history. Then resume with `retry`, not a new job.
- After verified durable publication, full article/research/image state and the job work directory are removed. Compact URL/title/date, identity, accounting and effect metadata remain. Failed/uncertain work is retained for reconciliation. Retrieve accepted content later from the website or its repository. Ordinary filesystem deletion and SQLite updates are not forensic secure erasure; external provider caches and backups are outside this cleanup.
- Google Search Console receives a sitemap submission, Bing receives the article URL, and IndexNow receives a URL notification. Accepted submissions are **not indexing confirmation**. No Google direct-indexing or ranking guarantee is provided.
- Failed search services have finite, delayed, selected-service retries. Missing configuration waits for a detectable configuration change. Accepted or unknown submissions are not automatically replayed. Post-publication recovery uses compact URL records, not a regenerated article.
- Completion messages report title, URL and each search outcome. A Hermes provider acknowledgment is not proof a recipient read the message. Ambiguous delivery or exhausted follow-ups require reconciliation; `followup_required` does not necessarily mean the article is unpublished.

## Review reminders

```sh
serpsmith reminders
serpsmith reminders --send --publish
serpsmith reminders --ack REMINDER_KEY
```

Default 30/60/90-day check-ins are grouped by blog and deduplicated before delivery. Listing reminders does not send them; acknowledgment records operator handling, not a claimed send. Pending/unknown delivery is not blindly repeated. Publications without a known date have no invented reminder dates. Reminders do not rewrite articles or automatically improve content.

Optional Search Console/GA4 observations can inform topic selection when `search.advisory_enabled` or `analytics.advisory_enabled` is set and access is configured. They remain advisory, not source evidence or a promise of traffic gains. There is no universal website compatibility or unattended-operation certification: qualify your own accounts, integration and deployment before relying on the service.
