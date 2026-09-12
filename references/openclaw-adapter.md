# OpenClaw reference adapter

OpenClaw is the first production-tested adapter for v27. These cron, session, plugin, and message details are not core requirements for other runtimes.

## Capability mapping

- Guarded execution: `serpsmith_exec`.
- Guard admission: `serpsmith_admit`.
- Pre-delivery and completion validation: `serpsmith_finalize` with explicit mode.
- Exhausted failure: `serpsmith_fail`.
- Image operation: `image_generate` plus the read-only watcher and durable queue dispatcher.
- Notification acknowledgment: the successful `message` result's non-secret identifier.

Production and recovery jobs use a dedicated agent, isolated sessions, exact allowlists, `delivery.mode=none`, and no runner-level failure alert when the workflow owns bounded recovery and terminal reporting. Allow only required file/image/message and Guard tools; exclude raw exec/bash/shell/process and native web search/fetch. Generated media never has a Telegram route.

## Turn admission

Start each production or recovery turn with `serpsmith_admit`. If unavailable, stop without mutation. Then validate the external runtime capability certification.

## Image recovery

The watcher reads canonical v27 `pending_operation` first. It accepts bounded v24 ledgers only for incomplete migration runs. The dispatcher rescans, deduplicates by checkpoint/token/source hash, and enqueues one leased `image_recovery` operation. A fixed restricted worker leases that operation through the bundled worker, rereads the checkpoint revision, verifies the site/run binding, and settles the queue receipt. The dispatcher never creates or addresses a cron session.

Never steer recovery with `sessions_send` to a cron session key. Cron session keys identify historical execution context, and a migrated or completed worker can reject the handoff with a placement mismatch. Reread the canonical checkpoint, then let the watcher/dispatcher enqueue the same run key. Verify the operation is revision-bound, deduplicated, leased to the fixed restricted worker, and has no runner delivery or failure-alert route.

## Reporting

After all gates pass, record `report_prepared` and finalize in `pre_delivery` mode. Record `report_delivery_started`, then send one plain-text message with no attachments. Record `report_acknowledged` with its non-secret identifier and finalize in `complete` mode. If delivery has started but no receipt was recorded, reconcile the receipt manually and never resend automatically. Only then run retention and return `NO_REPLY`.

Keep failed attempts, scheduler errors, and active recovery internal. The reconciliation monitor must check for one matching queued or running recovery before alerting. Send one Telegram error only after `serpsmith_fail` records a non-retryable or exhausted terminal state and no recovery remains. Verify this routing with an isolated canary in which a recoverable failure produces no Telegram message and a terminal failure produces exactly one.

## Post-update health check

After an OpenClaw update, agent/plugin change, or skill relocation:

1. Resolve the live SERPsmith skill root from the current installation; do not reuse a remembered path.
2. Inspect every production, monitor, recovery, and stream job. Verify each skill/script path in its payload or stream command exists. Preserve schedule expressions, timezones, enabled states, and delivery settings during diagnosis.
3. Inspect stream health separately from task-run history. Treat `streamStatus: restarting`, a growing `streamConsecutiveFailures`, or `streamError` as a live failure even when `lastRunStatus` is `ok` from an earlier event.
4. Check publisher and reconciliation state separately, then classify every site's canonical checkpoints. A green monitor does not prove a broken dispatcher can resume future external operations; confirm no run is stranded.
5. Invalidate the previous capability certification when the runtime version or resolved skill path changed. Re-run validation and the disposable canary before restoring `unattended-ready` status.

Completion: all referenced paths resolve, stream sources remain running, checkpoints have no actionable stranded work, the exact current runtime certification passes, and the canary proves the guarded lifecycle without external delivery.

## Canary

Before enabling v27 jobs, run an isolated disposable canary proving Guard admission, contained failure, passing execution, canonical state transitions, both finalizer modes, and no raw execution calls. Never send the canary externally.
