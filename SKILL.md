---
name: "serpsmith"
description: "Publish SEO articles, verify unattended health, and gate source-to-runtime releases."
---

# SERPsmith

Publish evidence-led, AI-search-ready articles to one authorized Git-backed site through a certified runtime adapter. OpenClaw is the first production-tested adapter, not the product boundary.

## 1. Load and bind one site

Read `references/core-policy.md` and its task-routed references. Load one external JSON profile and run `node scripts/validate-profile.mjs PROFILE`. Verify repository instructions, site/branch/upstream, clean tree, content/image/discovery paths, deployment, authorization, external state roots, and secret access without printing values. Stop on mismatch, unknown state, dirty/diverged work, missing ownership, or unresolved configuration.

Completion: one validated profile, one stable site/slot/run key, one external lock, and no unrelated changes.

## 2. Admit the runtime

Map native tools or wrappers to `references/adapter-contract.md`. Complete an exact runtime certification using `templates/runtime-capability-map.md` and validate it with:

    node scripts/validate-runtime-capabilities.mjs MAP unattended

Bind certification to the exact agent, runtime, host, model policy, tools, and permissions; repeat it after any change. For an OpenClaw update or skill relocation, run the post-update health check in `references/openclaw-adapter.md`. Unattended certification needs effective passing and safe-failure fixtures; stored configuration is not proof. A runtime that cannot restrict unsafe actions remains manual-only.

Use the provider-neutral classes in `references/execution-policy.md`. Run reconciliation, analytics collection, image correlation, and retention as deterministic processes. Reserve agent turns for reasoning or bounded routine work, and certify every model/context policy. A runtime with one model maps both agent classes to its certified default.

Completion: every required capability is proven for the exact runtime and mode, and every configured runtime path resolves from the live installation.

## 3. Create or resume canonical state

Use `scripts/checkpoint-state.mjs`, `scripts/run-controller.mjs`, and `references/reliability-contract.md`. New runs write only `serpsmith.run-checkpoint.v2` under `serpsmith-core-v27`. Let the deterministic controller choose one next stage, queue it with `scripts/durable-work-queue.mjs`, and execute the leased action through `scripts/durable-worker.mjs`; never duplicate an article, image request, commit, notification, or report. Every transition supplies the expected revision and uses the atomic writer.

Treat the checkpoint as publication truth. Scheduler results, agent-turn results, provider responses, and process exits are evidence only.

Completion: the checkpoint validates and identifies the earliest incomplete phase.

## 4. Research and prepare the article

Inventory posts, slugs, links, and the six latest images. Use configured Search Console, aggregate GA4, AI-search readiness, free demand signals, and authoritative sources. Label unmeasured demand as directional. Record intent, fit, cannibalization risk, citations, links, metadata, taxonomy, CTA, image direction, and alt text. Never invent evidence or product behavior.

Draft to the site adapter, then discover and read the installed portable `blader/humanizer` skill. Verify its `metadata.version` is 3.1.0 or newer before the embedded editorial pass; stop and report a missing or older skill instead of claiming the pass. Preserve facts, citations, exact product terms, structured data, and standard English Title Case H2/H3 headings. Rerun factual, citation, link, heading, metadata, and product-claim checks, and report the version actually used.

Completion: sourced prose and the site package pass validation without unrelated edits.

## 5. Generate and validate images

Follow `references/image-system.md`. Build two meaningfully different concepts from the article and recent-image conflict list. Prefer literal or functional clarity. Request one standalone, full-frame scene per returned file; never ask a provider to compose multiple concepts or candidate views into one image. Inspect originals and every configured desktop hero, mobile hero, card, and social crop. Produce the exact formats/dimensions, strip metadata, never stretch, and keep candidates internal.

Review at most four generated candidates. Treat one provider operation that returns one to four correlated files as a bounded candidate batch, not an ambiguous result; each file must itself be one usable article image. A contact sheet or split-screen collage is a severe defect, not a fallback candidate. If no candidate passes every quality gate after four reviews, select the highest-ranked fallback-eligible image and continue publication. Stop for an image only when every reviewed candidate fails a hard safety, truthfulness, branding/text, severe-defect, or technical asset gate.

Before an asynchronous provider call, record `external_requested` with operation ID, capability, candidate or bounded batch label, bounded filename, request time, and deadline. End the turn in `waiting_external`. Assign exactly one runtime completion owner. After entering `waiting_external`, the original publisher must ignore generic provider-completion callbacks; only the declared completion adapter may correlate the bounded result, record `external_completed` for the selected artifact, and resume the same run. Provider or scheduler success never means publication success. OpenClaw follows `references/openclaw-adapter.md`.

Completion: one selected, responsive, technically valid image pair is recorded.

## 6. Validate, publish, and verify

Run site checks, expected-diff validation, secret/privacy scan, image checks, configured build/lint/type checks, and AI-search readiness. Create one focused normal commit and push without force. Verify deployment, article, canonical, metadata, sitemap/discovery files, links, assets, crawlers, and search notifications. For ordinary articles, Google notification means a successful Search Console sitemap submission through the bundled adapter with HTTP 204 evidence; never call Google's JobPosting/livestream Indexing API, and never pass the Google gate from a rejected response. Resume only incomplete post-push gates.

Use structured retry classes from `references/adapter-contract.md`. Retry only transient or correctable attempts. Preserve state on concurrent upstream work, then fast-forward and revalidate when safe. Never resolve conflicts or absorb unrelated changes without explicit owner direction.

Completion: every canonical publication gate is true.

## 7. Acknowledge reporting and reconcile

Prepare the concise report and record `report_prepared`. Record `report_delivery_started` before the notification adapter call, then record `report_acknowledged` with its non-secret receipt. Never automatically resend a delivery whose started state has no receipt; classify it as ambiguous for bounded receipt reconciliation. Run the completion finalizer only after acknowledgment.

Run `node scripts/checkpoint-state.mjs classify CHECKPOINT` from an independent monitor. Dispatch bounded recovery for `stale_external`, `recovery_required`, and overdue `report_pending` without notifying the user while a matching recovery is available or active. Send one final error only when recovery is unavailable, unsafe, or exhausted. The monitor never mutates repositories. A run is green only when classification is `complete`.

After acknowledged delivery, run retention from `references/retention.md`: keep the latest three completed runs per site and only each selected source image.

Completion: checkpoint is `complete`, delivery is acknowledged exactly once, retention is recorded, and the repository is clean/synchronized.

## 8. Measure milestones and owner feedback

Create immutable aggregate Search Console snapshots with `scripts/google-search-console-snapshot.mjs` and evaluate published URLs at 7, 14, 28, and 90 days with `scripts/content-milestones.mjs`. Combine these observations with GA4 and require the existing Content Intelligence observation and owner-authorization gates before any existing-page change.

Record every explicit owner image rejection immediately in the private site-namespaced ledger through `scripts/image-feedback-ledger.mjs`, including post-publication feedback. Preserve the concrete reason, map it to a stable concept family and reusable constraint, read it back before replacement generation, and apply every relevant constraint to both briefs. Verify the entry before reporting completion. Exclude a concept family after two rejections until the owner clears it. Keep the ledger outside website repositories; memory, chat, and replaced assets are not substitutes.

Completion: milestone evidence and owner feedback are durable, private, site-isolated, read-back verified, and advisory.

For a sitewide SEO/GEO review, use the optional `references/seo-intelligence.md` workflow. Run its evidence gate, crawl, graph, opportunity, and competitor/SERP comparisons for every authorized site without changing the publication workflow or treating a missing data source as a zero-result finding.

## 9. Learn from reliability evidence

Follow `references/reliability-intelligence.md`. Record retry, recovery, and terminal outcomes in one private site ledger. Evaluate recurring signatures after each event, summarize unresolved patterns weekly, and surface only a newly eligible owner recommendation or one exhausted terminal failure.

Reliability intelligence may propose a reviewed change but never modify code, configuration, schedules, runtime, websites, or release state. Record the owner's decision.

Completion: recurring operational failures produce bounded, evidence-backed, approval-only recommendations.

## Runtime status

OpenClaw is the production-tested reference adapter. Every other runtime remains certification-pending until its exact capability map and end-to-end canary pass; documentation is not certification.

## Product release authorization

Treat source, distributable, and installed-runtime releases as separate mutations. Source work authorizes only the source destination unless the same user message explicitly names distribution or runtime activation. Plans, earlier source completion, and "continue" language do not grant promotion authority. After a source release, report and wait for new approval naming the next destination before any mutation; ask when ambiguous.

Completion: the recorded user approval names the exact release destination before the first mutation to that destination.
