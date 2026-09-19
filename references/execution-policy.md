# Token-efficient execution policy

SERPsmith routes work by capability, never by a vendor or model name. Copy `templates/execution-policy.example.json` outside the skill repository, keep its model references non-secret, and validate it with:

    node scripts/validate-execution-policy.mjs /absolute/path/execution-policy.json

## Portable classes

- `reasoning`: research, article writing, content review, and recovery that resumes editorial work.
- `routine`: bounded interpretation or finalization that still needs an agent but does not need the strongest configured model.
- `deterministic`: validated scripts with no model call.

`model_ref` is an opaque runtime configuration label, not a required provider or model ID. A runtime with one model maps both `reasoning` and `routine` to the same default reference. A runtime with safe model routing may map `routine` to a lower-cost model after certifying that exact runtime/model policy. Missing or unsupported routing must fall back to the certified default; it must never skip a gate.

## Required model-free tasks

Run these bundled adapters directly through a process scheduler or supervised service:

- reconciliation: `scripts/reconcile-runs.mjs`;
- analytics collection: `scripts/google-analytics-snapshot.mjs`;
- image correlation and queue dispatch: `scripts/openclaw-image-recovery-watch.mjs --dispatch --quiet --queue-root ...`;
- completed-run retention: `scripts/prune-completed-runs.mjs`.

The process boundary keeps credentials, profiles, checkpoints, and output paths external. Scripts return structured JSON or exit codes; they do not need an agent to restate fixed instructions. Wake an agent only when an actionable queue item needs reasoning, a weekly review needs interpretation, or a deterministic adapter returns an exhausted/unsafe state.

OpenClaw stream users should run the image watcher with `--dispatch --quiet`. It enqueues the durable operation without emitting a stream line, so correlation does not create an agent turn. The existing site recovery worker remains the only agent that resumes the article.

## Context discipline

Agent turns load only the selected task's references and a compact checkpoint-derived task packet. Do not attach prior chat history, unrelated site profiles, full analytics payloads, or completed-stage evidence. Keep the full evidence on disk and pass only stable references plus the facts needed for the current stage.

Optimization never weakens admission, profile binding, source quality, Humanizer, image inspection, repository validation, deployment verification, acknowledged reporting, or recovery safety. After any model-policy or context-policy change, invalidate and repeat runtime certification and end-to-end canaries.
