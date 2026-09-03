# Unattended SERPsmith runbook

A scheduler payload for an authorized site must specify:

- exactly one site profile;
- stable weekday/time/timezone and publication-slot identity;
- repository workspace and branch;
- external checkpoint directory and per-site lock;
- configured Google Search Console credential adapter;
- configured Bing Webmaster Tools secret adapter;
- configured IndexNow key/endpoint;
- final notification channel and destination;
- explicit statement that unattended publication is authorized for this site.

The payload must tell the agent to read the live SERPsmith skill and repository AGENTS.md, resume idempotently, publish at most one article for the slot, avoid routine approval prompts, and send only the final success or failure report.

For shell work, the payload must require checked-in adapters or small bounded commands, `serpsmith_`-prefixed scratch variables, and a prohibition on assigning shell-special names such as `path`, `PATH`, `status`, `pipestatus`, `IFS`, `HOME`, `CDPATH`, or `FPATH`.

Every retryable, calibratable, or alternate-path shell probe must run through `scripts/controlled-attempt.sh`; never issue it as a raw runtime command. This includes secret-scan matchers and image-metadata probes. Do not reproduce the wrapper inline. Record its structured result and retry the same checkpoint when allowed. Only a genuinely exhausted or immediately non-retryable gate may produce a raw nonzero runtime result.

For live endpoint status, MIME, and marker checks, invoke `node scripts/live-http-check.mjs`. Never stream a network response into `grep -q`, `head`, or another early-exit reader. If a later semantic check is needed, first download the entire response to a temporary file, then inspect that file.

Before enabling a recurring job, complete `repository-onboarding.md` and `search-engine-onboarding.md`, produce a sanitized `ready` report for every required search integration, and perform a read-only preflight: clean/synchronized repository, SSH remote, credential file/key presence without revealing contents, Google property access, Bing verified ownership, live IndexNow key, image generation availability, local conversion tools, checkpoint directory writability, and configured final-report delivery. Do not publish during preflight.

Stagger site jobs so their maximum runtimes do not normally overlap. Keep each site in a separate recurring job and checkpoint namespace.

## Enforced OpenClaw mode

For OpenClaw production jobs, raw shell access is forbidden. Route every shell command through `serpsmith_exec`, including commands expected to pass. Use native file, web, and image tools directly only when they are present in the reviewed job allowlist. Prepare the final report and persist `report_prepared`, call `serpsmith_finalize`, send the report, and persist `report_delivered` only after confirmed delivery. Use `serpsmith_fail` only for an immediately non-retryable or exhausted gate.

Release verification must inspect the live stored job payload, not a migrated JSON file or a prose prompt, and prove the schedule is unchanged and raw execution tools are absent.
