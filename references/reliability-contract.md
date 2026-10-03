# SERPsmith v27 reliability contract

This contract is runtime-neutral. OpenClaw is the production-tested reference adapter; other AI agents, workflow engines, CI systems, and schedulers implement the same capabilities and state transitions.

## Publication truth

The canonical checkpoint is authoritative. A scheduler result, agent-turn result, provider result, process exit, or chat delivery is evidence only. A run is complete only when the checkpoint is valid, every publication gate is true, the report is acknowledged, and the lifecycle state is `complete`.

Use `scripts/checkpoint-state.mjs` for v27 checkpoints. New runs write only `serpsmith.run-checkpoint.v2`. Legacy shapes are read only by an explicit migration adapter.

## Lifecycle

Allowed lifecycle states:

- `running`: an agent or deterministic adapter may advance the current phase.
- `waiting_external`: one external operation is pending until its recorded deadline.
- `recovery_required`: reconciliation found a stale or retryable external operation.
- `awaiting_report_ack`: publication gates passed and the final report is prepared.
- `failed`: a non-retryable or exhausted failure is recorded.
- `complete`: the report has a non-secret acknowledgment receipt.

Every transition supplies `expected_revision`. The state writer uses an atomic same-directory rename and increments `revision`. A stale writer fails instead of overwriting newer state.

## Required publication gates

`repository_preflight`, `article_validation`, `structural_validation`, `metadata_validation`, `secret_scan`, `commit`, `push`, `deployment`, `live_article`, `live_assets`, `google_notification`, `bing_notification`, and `indexnow_notification`.

## External operations

Before an asynchronous call, record `external_requested` with:

- stable `operation_id`;
- capability such as `image_generate`;
- request timestamp and deadline;
- bounded requested filename when an artifact is expected;
- candidate identifier when applicable.

The runtime declares exactly one provider-completion owner. The original publisher stops owning image completion after it records `waiting_external` and must ignore generic completion callbacks. The declared completion adapter correlates one to four exact artifacts from the same bounded operation, reviews the batch, and records `external_completed` for exactly one selected artifact. Record each inspected image through `image_reviewed` before another operation or a final image decision. The checkpoint permits `no_hard_gate_eligible_image` only after four distinct hard-rejected reviews; fewer reviewed images require a bounded replacement operation in the same run. This is a state guard, not an automatic provider retry or proof that artifacts were visually inspected; the completion owner must still verify and correlate each file. Zero, more than four, stale, or root-escaping artifacts fail closed. If another lane already completed that exact operation, a matching stale worker settles silently as an idempotent duplicate and queues at most one resume from the current revision. An agent ending at this boundary leaves the run `waiting_external`; it never marks the run complete. Reconciliation after the deadline produces `recovery_required`. Retry the same operation/run key or record a bounded replacement operation; never create a second article run.

For a one-file completion, `artifact_refs` defaults to the selected `artifact_ref`. For a multi-file completion, pass the exact one-to-four `artifact_refs` list in `external_completed`; `image_reviewed` accepts only those correlated refs. A list is checkpoint evidence, not proof of artifact bytes or visual inspection, which remain the completion adapter's responsibility.

The OpenClaw completion owner records one private review JSON with `selected_source` and `reviews: [{source, verdict, rank}]`, covering every leased source exactly once with unique 1-based ranks. After visually inspecting every original, it calls `node scripts/complete-image-batch.mjs LEASED_JOB_JSON REVIEW_JSON GENERATED_MEDIA_ROOT` through guarded execution. The adapter requires an inflight lease, exact checkpoint revision and operation binding, bounded regular files inside the media root, and selection of the highest-ranked hard-gate-eligible candidate. It hashes each file, records the completed operation and all reviews in one checkpoint update, and returns the next bounded action. The adapter does not judge image quality, produce derivatives, or claim that a provider result is publishable; the completion owner still owns those checks. Keep the review JSON private and do not put it in a website repository.

After recording the batch's reviews, `node scripts/image-budget-plan.mjs plan CHECKPOINT` returns one bounded next step: review remaining correlated files, request a distinct image within the remaining budget, select a normal image, select the best fallback with owner-review note, or record hard image failure. This planner is read-only and does not call the image provider, choose a ranking, or mutate the run. A runtime must execute its recommendation against the same checkpoint revision and re-plan after any transition.

The durable image worker must reread the checkpoint after its completion handler returns. It may settle a handoff as fully reviewed only when the recorded operation, correlated artifact count, and one review per artifact match the leased job. An unchanged checkpoint is a bounded retry. A completed but partially reviewed batch queues one current-revision `review_completed_image` stage resume with the same source list, without repeating generation. A fully reviewed batch queues one revision-bound stage resume carrying the planner action; the image handler must not separately resume the publisher. A historical hard-failure checkpoint is terminal only after four recorded hard rejections and never gets a publication resume. Neither a provider callback nor a worker return value alone completes an article.

Run `node scripts/test-image-recovery-canary.mjs` as an offline DEV fixture for correlation, queue dispatch, worker settlement, review recording, and the remaining-budget decision. Passing this fixture is not an unattended production canary: it uses synthetic image content and supplied review verdicts, so the real completion owner and publisher still need a supervised end-to-end proof before runtime activation.

## Reconciliation

Run `node scripts/checkpoint-state.mjs classify CHECKPOINT` independently of the publication agent. Results are:

- `running`
- `waiting`
- `stale_external`
- `recovery_required`
- `report_pending`
- `failed`
- `complete`

A deterministic controller classifies the checkpoint and selects one next action. Queue that action in the durable work queue, lease it to one short-lived worker through `scripts/durable-worker.mjs`, verify the job/checkpoint site, run, and revision binding, and settle it with a receipt or structured failure. Reap expired leases into bounded retry without resuming a historical agent conversation.

Record retry, recovery, and terminal outcomes through `references/reliability-intelligence.md`. Telemetry is advisory and bounded; it never owns publication state or authorizes a mutation.

A monitor dispatches recovery for `stale_external`, `recovery_required`, overdue `report_pending`, and a completed-image checkpoint that has remained `running` for at least ten minutes without a pending or inflight job. It never mutates repositories or exposes a recoverable attempt as a final user error. While one matching recovery is queued or running, remain silent. A started report delivery without a receipt is `report_ambiguous`: never resend it automatically. When `reconcile-runs.mjs` reports `owner_review_required`, deliver one review request per stable `review_key` and retain the non-secret receipt; do not discard the result merely because reconciliation exited successfully. Request owner review when state is invalid or ambiguous, a worker has not started within its bound, or a sealed recovery settled without checkpoint progress. Send a final error only for a recorded terminal failure.

## Capability admission

Validate the exact agent/runtime/host/tool configuration with `scripts/validate-runtime-capabilities.mjs`. Certification expires after any agent, model, host, plugin, permission, or adapter change. Unattended mode requires effective evidence for filesystem, Git, research, images, HTTP, secrets, content, deploy, notifications, checkpoints, scheduler, tool restriction, and reporting.

Stored configuration is not effective proof. The reference adapter must run a harmless isolated canary that exercises its real guarded execution and both checkpoint finalization modes. Other runtimes provide equivalent fixtures.

## Reporting

Record `report_prepared` only after all publication gates pass. Record `report_delivery_started` before the notification call, then record `report_acknowledged` with a non-secret receipt and validate complete state. A failure before delivery starts is retryable; a missing receipt after delivery starts is ambiguous and requires receipt reconciliation instead of automatic resend.

## Image tooling

The runtime capability certification names one tested decode/convert/crop/inspect toolchain. A run uses that toolchain only. Do not probe alternate libraries during publication. Validate original, WebP/JPEG outputs, MIME, exact dimensions, metadata stripping, and every configured responsive crop before commit.

## OpenClaw reference adapter

OpenClaw keeps image correlation and isolated recovery in its watcher/dispatcher. Production and recovery jobs begin with the current v27 contract, use Guard-restricted execution, disable fallback/media delivery, and send only the final text report. OpenClaw-specific session, cron, and tool names never appear in the core checkpoint schema.
