# SERPsmith v25 reliability contract

This contract is runtime-neutral. OpenClaw is the production-tested reference adapter; other AI agents, workflow engines, CI systems, and schedulers implement the same capabilities and state transitions.

## Publication truth

The canonical checkpoint is authoritative. A scheduler result, agent-turn result, provider result, process exit, or chat delivery is evidence only. A run is complete only when the checkpoint is valid, every publication gate is true, the report is acknowledged, and the lifecycle state is `complete`.

Use `scripts/checkpoint-state.mjs` for v25 checkpoints. New runs write only `serpsmith.run-checkpoint.v2`. Legacy shapes are read only by an explicit migration adapter.

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

The provider completion adapter correlates one exact artifact and records `external_completed`. An agent ending at this boundary leaves the run `waiting_external`; it never marks the run complete. Reconciliation after the deadline produces `recovery_required`. Retry the same operation/run key or record a bounded replacement operation; never create a second article run.

## Reconciliation

Run `node scripts/checkpoint-state.mjs classify CHECKPOINT` independently of the publication agent. Results are:

- `running`
- `waiting`
- `stale_external`
- `recovery_required`
- `report_pending`
- `failed`
- `complete`

A monitor alerts or dispatches recovery for `stale_external`, `recovery_required`, and overdue `report_pending`. It never mutates repositories. The runtime adapter owns wakeups, retries, and alert routing.

## Capability admission

Validate the exact agent/runtime/host/tool configuration with `scripts/validate-runtime-capabilities.mjs`. Certification expires after any agent, model, host, plugin, permission, or adapter change. Unattended mode requires effective evidence for filesystem, Git, research, images, HTTP, secrets, content, deploy, notifications, checkpoints, scheduler, tool restriction, and reporting.

Stored configuration is not effective proof. The reference adapter must run a harmless isolated canary that exercises its real guarded execution and both checkpoint finalization modes. Other runtimes provide equivalent fixtures.

## Reporting

Record `report_prepared` only after all publication gates pass. Validate pre-delivery state, call the notification adapter once, then record `report_acknowledged` with a non-secret receipt and validate complete state. Delivery failure leaves the run resumable at `awaiting_report_ack`; it must not be reported as scheduler success.

## Image tooling

The runtime capability certification names one tested decode/convert/crop/inspect toolchain. A run uses that toolchain only. Do not probe alternate libraries during publication. Validate original, WebP/JPEG outputs, MIME, exact dimensions, metadata stripping, and every configured responsive crop before commit.

## OpenClaw reference adapter

OpenClaw keeps image correlation and isolated recovery in its watcher/dispatcher. Production and recovery jobs begin with the current v25 contract, use Guard-restricted execution, disable fallback/media delivery, and send only the final text report. OpenClaw-specific session, cron, and tool names never appear in the core checkpoint schema.
