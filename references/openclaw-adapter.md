# OpenClaw reference adapter

OpenClaw is the first production-tested adapter for v25. These cron, session, plugin, and message details are not core requirements for other runtimes.

## Capability mapping

- Guarded execution: `serpsmith_exec`.
- Guard admission: `serpsmith_admit`.
- Pre-delivery and completion validation: `serpsmith_finalize` with explicit mode.
- Exhausted failure: `serpsmith_fail`.
- Image operation: `image_generate` plus the read-only watcher and isolated dispatcher.
- Notification acknowledgment: the successful `message` result's non-secret identifier.

Production and recovery jobs use a dedicated agent, isolated sessions, exact allowlists, and `delivery.mode=none`. Allow only required file/image/message and Guard tools; exclude raw exec/bash/shell/process and native web search/fetch. Generated media never has a Telegram route.

## Turn admission

Start each production or recovery turn with `serpsmith_admit`. If unavailable, stop without mutation. Then validate the external runtime capability certification.

## Image recovery

The watcher reads canonical v25 `pending_operation` first. It accepts bounded v24 ledgers only for incomplete migration runs. The dispatcher rescans, binds one source production job, deduplicates by checkpoint/token/source hash, and creates one isolated auto-deleting continuation. The generic completion lane returns `NO_REPLY` and never publishes or reports.

Before starting the dispatcher, set `SERPSMITH_PRODUCTION_DECLARATIONS_JSON` to a JSON object that maps each configured profile's `site_key` to its reviewed source automation declaration key. Keep this runtime-specific mapping outside the distributable skill and never commit production identifiers.

## Reporting

After all gates pass, record `report_prepared` and finalize in `pre_delivery` mode. Send one plain-text message with no attachments. Record `report_acknowledged` with its non-secret identifier and finalize in `complete` mode. Only then run retention and return `NO_REPLY`.

## Canary

Before enabling v25 jobs, run an isolated disposable canary proving Guard admission, contained failure, passing execution, canonical state transitions, both finalizer modes, and no raw execution calls. Never send the canary externally.
