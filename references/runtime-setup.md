# Runtime setup

Read `agent-runtime-onboarding.md` first.

## OpenClaw

Production-tested reference integration. Install under `skills/serpsmith/`, keep profiles/state outside, and use one isolated job per site. Unattended jobs use the guard plugin and exclude raw shell/exec/process tools.

## Hermes

Designed to work; certification pending. Treat as experimental until the exact runtime/version completes the capability map, fixture, resume, failure injection, search adapters, scheduling, action boundary, and final delivery.

## Claude, ChatGPT, and other agents

Designed to work when the exact coding/agent environment can load the complete skill and provide every required capability. Certification remains pending until that runtime/version completes the full test matrix. A normal chat without repository and execution tools cannot automate SERPsmith.

## Portable fallback

`controlled-attempt.sh` reports bounded attempts but is not enforced autopilot safety while raw execution remains available. `live-http-check.mjs` provides deterministic status, MIME, and marker verification without early-exit pipe failures.
