# SERPsmith

SERPsmith provides multi-platform AI agent support for evidence-led SEO and AI-search publishing on Git-backed websites. An agent can use it when its environment provides the required repository, research, image, network, secret, state, and approval tools.

## Beta status

Version: `v0.4.0-beta.4`

SERPsmith is beta software. The bundled publishing path targets Git-backed Markdown sites with deterministic sitemap updates. Runtime portability is capability-based; each runtime/version must be certified independently.

## What it does

- isolates every site through an external profile;
- rejects duplicate or cannibalizing topics;
- creates people-first articles with site-specific guardrails and at most two categories and three tags;
- adds useful internal links and small reciprocal links with descriptive anchor text when natural;
- starts with two distinct image concepts, reviews at most six generated candidates, and selects one using a documented rubric;
- after six candidates, publishes the highest-ranked relevant, safe, technically valid fallback when no candidate clears every aesthetic gate, then discloses the exact exception for owner review;
- produces an exact 1280 x 720 WebP hero and a locally derived matching JPEG social image;
- uses external checkpoints and locks to resume safely;
- validates the expected diff before commit;
- stops on secrets, unsafe claims, dirty/diverged repositories, auth failures, or conflicts;
- verifies live content, metadata, assets, crawlers, and configured search notifications;
- validates Google AI features, ChatGPT Search, and Perplexity search readiness from fresh same-site evidence without inventing an LLM score;
- optionally verifies exact GA4 property/hostname access and creates immutable aggregate Organic Search snapshots.

## SEO principles and expectations

SERPsmith applies SEO best practices; it does not promise outcomes. No SEO workflow can guarantee indexing, rankings, traffic, leads, or revenue, and results will vary by site, market, competition, authority, technical health, content quality, and time.

- **Publishing frequency:** There is no universal posting frequency that makes a site rank. For many new or small sites, one thoroughly researched article per week is a sensible operating baseline, not a ranking factor. Configure a sustainable site-specific cadence and increase it only when research quality, originality, review, internal linking, and technical validation remain strong. SERPsmith rejects filler rather than publishing to satisfy a quota.
- **Internal cross-linking:** New articles should link to genuinely useful existing pages, with small reciprocal links added from older pages when natural. Crawlable links help search engines discover pages and understand their relationship; descriptive anchor text helps readers and search engines understand the destination. SERPsmith avoids forced, repetitive, or irrelevant links.
- **Best-practice core:** The workflow prioritizes search intent, original value, authoritative evidence, accurate claims, clear structure, useful links, descriptive metadata, canonical and sitemap hygiene, accessible images, technical validation, and live verification. These practices improve eligibility, discoverability, and usefulness; they do not guarantee a particular search result.

See Google's guidance on [helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [crawlable links and internal linking](https://developers.google.com/search/docs/crawling-indexing/links-crawlable), and the [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

## Requirements

- Node.js 20 or later for the publishing runtime;
- Node.js 22.12 or later when building or testing the bundled OpenClaw Guard plugin;
- a Git-backed website with a configured branch/upstream;
- a tool-capable agent with filesystem/Git, web research, image generation, local conversion, HTTP verification, and secret access;
- external directories for profiles, state, locks, drafts, and reports;
- a verifiable deployment path.

Scheduling and final-message delivery are required only for unattended mode.

## Install

Clone or copy this repository into the skill directory used by your agent runtime. Keep real profiles, credentials, state, and generated operational data outside this repository.

Read:

1. `references/quickstart.md`
2. `references/repository-onboarding.md`
3. `references/search-engine-onboarding.md`
4. `references/ai-search-discoverability.md`
5. `references/google-analytics-onboarding.md`
6. `references/content-intelligence.md`
7. `references/site-profile-schema.md`
8. `references/agent-runtime-onboarding.md`
9. `references/grok-build-onboarding.md` when using Grok Build
10. `references/runtime-setup.md`
11. `references/image-system.md`
12. `references/troubleshooting.md`

## Safe first run

1. Follow `references/repository-onboarding.md` and add reviewed site repository instructions from `templates/site-repository-instructions.md`.
2. Follow `references/search-engine-onboarding.md` for Google Cloud/Search Console API, Bing, and IndexNow.
3. Copy the Git example profile outside the repository.
4. Replace every placeholder and keep `autopilot_enabled` set to `false`.
5. Validate the profile:

```bash
node scripts/validate-profile.mjs /absolute/private/path/site-profile.json
```

6. Ask the agent to run read-only preflight only—no article, repository mutation, push, deployment, search notification, or schedule change.
7. After preflight passes, prepare one manual article and review the topic, sources, both image concepts, reciprocal links, and complete diff.
8. Publish only after explicit approval.

The disposable fixture in `examples/demo-site/` can be copied to a temporary local Git directory for practice without a public remote.

## Bundled adapters

- `scripts/validate-profile.mjs`: structural JSON profile validation; no shell, Git, credential, or network execution.
- `scripts/markdown-content-adapter.mjs`: creates a Markdown article and updates a simple XML sitemap.
- `scripts/ai-search-readiness.mjs`: deterministic AI-search evidence validation.
- `scripts/google-search-console-check.mjs`: read-only Google property/sitemap test.
- `scripts/google-analytics-check.mjs`: read-only GA4 property/hostname/Data API verification.
- `scripts/google-analytics-snapshot.mjs`: immutable aggregate Organic Search 7/28/90-day snapshots.
- `scripts/google-search-console-submit.mjs`: Google sitemap submission adapter.
- `scripts/bing-webmaster-submit.sh`: portable Bing check/submission adapter.
- `scripts/indexnow-submit.sh`: explicit-key-file IndexNow check/submission adapter.
- `scripts/search-onboarding-report.mjs`: sanitized Google, Bing, and IndexNow readiness report.
- `scripts/test-user-onboarding-docs.sh`: documentation completeness regression.

Git preflight, image generation/conversion, deployment, scheduling, and reporting may be supplied by the agent runtime or separately reviewed adapters.

## Content Intelligence

SERPsmith joins Search Console visibility with aggregate GA4 landing-page behavior, then observes a recommendation for at least 7 days and normally 14 before it may become eligible for owner authorization. Stable evidence requires at least two comparable snapshots. Low traffic, volatility, recent deployments, or conflicting signals use the longer window.

Eligibility never equals permission. Internal-link additions, small content refreshes, metadata edits, and CTA-copy edits require explicit approval for exact URLs and a proposed diff. After one approved change, SERPsmith measures another 7–14 days before recommending a second optimization to that page. It never uses analytics alone to authorize deletions, redirects, major rewrites, product/template changes, tracking changes, schedule changes, or bulk edits.

For OpenClaw unattended mode, `plugins/openclaw-serpsmith-guard/` provides guarded shell execution, deliberate exhausted-gate failure, and checkpoint finalization. Production jobs must use a per-job tool allowlist that excludes raw shell/exec/process access. The portable shell wrapper remains a fallback for runtimes without tool restrictions, not equivalent enforcement.

## Compatibility

- **OpenClaw:** production-tested reference integration.
- **Hermes:** designed to work; certification pending.
- **Grok Build:** designed to work; certification pending. See `references/grok-build-onboarding.md`.
- **Claude-based agent environments:** designed to work; certification pending.
- **ChatGPT agent environments:** designed to work; certification pending.
- **Other AI agent platforms:** designed to work; certification pending.

A normal chat without repository and execution tools cannot automate the workflow. See `references/compatibility.md` for the exact test-status meaning.

## Security

Never commit credentials, real profiles, local paths, private identifiers, state, drafts, reports, or publishing history. See `SECURITY.md`.

## License

SERPsmith is available under AGPL-3.0-only or a separate commercial license.
See `LICENSE` and `COMMERCIAL-LICENSE.md`.
