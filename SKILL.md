---
name: "serpsmith"
description: "Publish SEO articles reliably across AI-agent runtimes."
---

# SERPsmith

Publish evidence-led, AI-search-ready articles to one authorized Git-backed site. SERPsmith core defines capabilities and durable state; each AI agent or workflow engine supplies a reviewed runtime adapter. OpenClaw is the first production-tested adapter, not the product boundary.

## 1. Load and bind one site

Read `references/core-policy.md`, then the references it routes to for the selected task. Load exactly one external JSON profile and run `node scripts/validate-profile.mjs PROFILE`. Read repository instructions and verify site, branch, upstream, clean tree, content/image/discovery paths, deployment, authorization, external state roots, and secret access without printing values. Stop on mismatch, unknown state, dirty/diverged work, missing ownership, or unresolved configuration.

Completion: one validated profile, one stable site/slot/run key, one external lock, and no unrelated changes.

## 2. Admit the runtime

Map native tools or wrappers to `references/adapter-contract.md`. Complete an exact runtime certification using `templates/runtime-capability-map.md` and validate it with:

    node scripts/validate-runtime-capabilities.mjs MAP unattended

Bind certification to the exact agent, runtime version, host, model policy, plugins/tools, and permissions. Repeat it after any change. Stored configuration is not proof; unattended certification needs effective passing and safe-failure fixtures. A runtime that cannot restrict unsafe actions remains manual-only.

Completion: every required capability is proven for the exact runtime and mode.

## 3. Create or resume canonical state

Use `scripts/checkpoint-state.mjs` and `references/reliability-contract.md`. New runs write only `serpsmith.run-checkpoint.v2` under `serpsmith-core-v25`. Resume the same run key; never duplicate an article, image request, commit, notification, or report. Every transition supplies the expected revision and uses the atomic writer.

Treat the checkpoint as publication truth. Scheduler results, agent-turn results, provider responses, and process exits are evidence only.

Completion: the checkpoint validates and identifies the earliest incomplete phase.

## 4. Research and prepare the article

Inventory posts, slugs, links, and the six latest images. Use configured Search Console, aggregate GA4, AI-search readiness, free demand signals, and authoritative sources. Label unmeasured demand as directional. Record intent, fit, cannibalization risk, citations, links, metadata, taxonomy, CTA, image direction, and alt text. Never invent evidence or product behavior.

Draft to the site adapter, then run portable `blader/humanizer` at reviewed version 2.9.1 or newer. Preserve facts, citations, exact product terms, structured data, and standard English Title Case H2/H3 headings. Rerun factual, citation, link, heading, metadata, and product-claim checks.

Completion: sourced prose and the site package pass validation without unrelated edits.

## 5. Generate and validate images

Follow `references/image-system.md`. Build two meaningfully different concepts from the article and recent-image conflict list. Prefer literal or functional clarity. Inspect originals and every configured desktop hero, mobile hero, card, and social crop. Produce the exact formats/dimensions, strip metadata, never stretch, and keep candidates internal.

Before an asynchronous provider call, record `external_requested` with operation ID, capability, candidate, bounded filename, request time, and deadline. End the turn in `waiting_external`. A runtime adapter correlates exactly one artifact, records `external_completed`, and resumes the same run. Provider or scheduler success never means publication success. OpenClaw follows `references/openclaw-adapter.md`.

Completion: one selected, responsive, technically valid image pair is recorded.

## 6. Validate, publish, and verify

Run site checks, expected-diff validation, secret/privacy scan, image checks, configured build/lint/type checks, and AI-search readiness. Create one focused normal commit and push without force. Verify deployment, article, canonical, metadata, sitemap/discovery files, links, assets, crawlers, and search notifications. Resume only incomplete post-push gates.

Use structured retry classes from `references/adapter-contract.md`. Retry only transient or correctable attempts. Preserve state on concurrent upstream work, then fast-forward and revalidate when safe. Never resolve conflicts or absorb unrelated changes without explicit owner direction.

Completion: every canonical publication gate is true.

## 7. Acknowledge reporting and reconcile

Prepare the concise report and record `report_prepared`. Validate pre-delivery state, call the notification adapter once, then record `report_acknowledged` with a non-secret receipt. Run the completion finalizer only after acknowledgment. Delivery failure remains resumable at `awaiting_report_ack`.

Run `node scripts/checkpoint-state.mjs classify CHECKPOINT` from an independent monitor. Alert or dispatch bounded recovery for `stale_external`, `recovery_required`, and overdue `report_pending`. The monitor never mutates repositories. A run is green only when classification is `complete`.

After acknowledged delivery, run retention from `references/retention.md`: keep the latest three completed runs per site and only each selected source image.

Completion: checkpoint is `complete`, delivery is acknowledged exactly once, retention is recorded, and the repository is clean/synchronized.

## Runtime status

OpenClaw is the production-tested reference adapter. Hermes, Grok Build, Claude-based agents, ChatGPT/Codex agents, Gemini-based agents, CI systems, and other runtimes remain certification-pending until their exact capability maps and end-to-end canaries pass. Never infer certification from documentation.
