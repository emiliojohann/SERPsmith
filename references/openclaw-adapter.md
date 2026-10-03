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

Review JSON ranks are unique, 1-based integers. Select the lowest-ranked image among those passing all normal gates; otherwise the lowest-ranked fallback-eligible image, or a provisional hard-rejected artifact only when no eligible one exists. The adapter validates that precedence but does not supply visual judgment.

The fixed OpenClaw image worker must use the released `complete-image-batch.mjs` adapter after visually inspecting every correlated original. It writes one private review JSON containing `selected_source` and a `reviews` entry for each leased source, with verdict `normal_pass`, `fallback_eligible`, or `hard_rejected`; it must not fabricate a review for an unseen file. Invoke the adapter through `serpsmith_exec` with the leased job JSON path, review JSON path, and bounded generated-media root. The adapter records all correlated artifact hashes and reviews in one checkpoint update and returns the next image-budget action. The durable worker then queues one revision-bound `stage_resume` with that action. For `request_distinct_image`, resume the same run and request only the remaining candidate budget with a new visual concept. For `select_normal_image` or `select_best_fallback`, complete image conversion and publishing gates; a fallback requires the exact exception and owner-review recommendation. For `record_hard_image_failure`, mark the canonical checkpoint failed only after four hard rejections. A `review_completed_image` resume inspects the original correlated sources still pending review and never calls the provider again. Do not run an independent publisher resume inside the image handler; the queue owns continuation.

The durable watcher/dispatcher is the sole image-completion owner. After a publisher records `waiting_external`, its generic provider-completion callback is a no-op and must not mutate the checkpoint, copy media, publish, report, or enqueue work. For canonical v27 checkpoints, the watcher polls every 15 seconds and caps a no-artifact wait at the earlier of the recorded deadline or ten minutes after `requested_at`. At expiry it enqueues one revision-bound `stage_resume` with action `recover_external`; the site worker retries the same operation/run without repeating research or creating a second article. The durable operation marker deduplicates subsequent scans, and periodic reconciliation remains a fallback only. The watcher reads canonical v27 `pending_operation` first. Record new requests with capability `image_generate`; until older checkpoints are complete, the watcher, reconciler, and recovery worker must also accept `image_generation` for that same bounded operation. Match the bounded requested stem and request time even when the provider writes a PNG for a requested WebP; reject non-raster output and any batch larger than four rather than guessing. It accepts bounded v24 ledgers only for incomplete migration runs. Run it as a supervised deterministic stream with `--dispatch --quiet --queue-root SITE_QUEUE`; successful correlation then enqueues work without emitting a line that creates an agent turn. The watcher accepts one to four unique, timestamp-bound files from the recorded provider operation as one candidate batch; zero or more than four fails closed. The dispatcher rescans, deduplicates by checkpoint/token/sorted-source-list hash, and enqueues one leased `image_recovery` operation. A fixed restricted worker leases that operation through the bundled worker, rereads the checkpoint revision, verifies the site/run binding, inspects every source, and selects exactly one highest-ranked passing or fallback-eligible artifact. If the exact operation was already completed by a racing lane, the worker settles the stale ticket silently and enqueues at most one current-revision stage resume. The dispatcher never creates or addresses a cron session.

Run `reconcile-runs.mjs` from the monitor and inspect `owner_review_required` before reporting the monitor healthy. The array is empty while bounded recovery is queued or running. A nonempty array means a checkpoint is invalid, a report receipt is ambiguous, a recovery worker has stalled, or a sealed recovery operation settled without advancing the checkpoint. For each stable `review_key`, call `scripts/owner-review-receipts.mjs status SITE_KEY SITE_RECEIPT_ROOT REVIEW_KEY`; if unacknowledged, send a plain-text request for review with the site, article slug, publication state, blocker, and exact next decision. After a successful message call, record its non-secret receipt with `scripts/owner-review-receipts.mjs record SITE_KEY SITE_RECEIPT_ROOT REVIEW_KEY RECEIPT`, then read back acknowledged status. If the send or record fails, leave the review unacknowledged for a later bounded retry and surface the monitor failure through a configured owner failure route. A repeated review request is preferable to a silently stranded article. Never leave the monitor as a command-only `delivery.mode=none` job that accepts `action_required` while discarding `owner_review_required`. Keep ordinary recovery attempts silent. Run GA4 snapshots and completed-run retention directly. See `execution-policy.md`.

The bundled `scripts/openclaw-owner-review-notify.mjs RESULT_JSON SITE_KEY SITE_RECEIPT_ROOT TELEGRAM_CHAT_ID [PROJECT_LABEL]` is the OpenClaw command adapter for this handoff. Configure a distinct human-readable project label for each connected blog; each review alert also includes the stable site key, post slug when readable, and run key, so an owner can identify the affected work even if the checkpoint is damaged. Invoke it on every per-site reconciliation result before marking the monitor healthy. It sends only nonempty `owner_review_required` entries, reads back receipts, and exits nonzero if delivery or acknowledgment fails. Keep the Telegram target and site receipt paths in private runtime configuration, never the distributable. The monitor itself must have an owner-visible failure route so a CLI/send failure cannot become another silent green job. Prove that route with a disposable stalled-run canary: active recovery sends no message; an exhausted/settled recovery sends exactly one review request; repeat reconciliation sends none; forced send failure reports monitor failure. Do not claim the fix is LIVE merely because the source tests pass.

Never steer recovery with `sessions_send` to a cron session key. Cron session keys identify historical execution context, and a migrated or completed worker can reject the handoff with a placement mismatch. Reread the canonical checkpoint, then let the watcher/dispatcher enqueue the same run key. Verify the operation is revision-bound, deduplicated, leased to the fixed restricted worker, and has no runner delivery or failure-alert route.

The reconciliation monitor also checks for a checkpoint whose image operation is completed, lifecycle remains `running`, last update is at least ten minutes old, and no matching pending or inflight queue job exists. It queues one revision-bound stage resume and stays silent. Queue operation identities remain sealed across pending, inflight, complete, and failed states so the same recovery cannot be recreated after settlement.

## Reporting

After all gates pass, record `report_prepared` and finalize in `pre_delivery` mode. Record `report_delivery_started`, then send one plain-text message with no attachments. Record `report_acknowledged` with its non-secret identifier and finalize in `complete` mode. If delivery has started but no receipt was recorded, reconcile the receipt manually and never resend automatically. Only then run retention and return `NO_REPLY`.

Keep failed attempts, scheduler errors, and active recovery internal. The reconciliation monitor must check for a live matching recovery before alerting. When `owner_review_required` is nonempty, send a review request even if the checkpoint cannot safely be marked terminal (for example, an ambiguous report receipt or a settled retry with no progress). Do not claim publication failed when the `published` field is true or unknown. Reserve the final error path for a `serpsmith_fail`-recorded terminal state. Verify routing with isolated canaries: an active recovery produces no owner message; a stalled or settled-without-progress recovery produces one review request; a terminal failure produces one final error.

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
