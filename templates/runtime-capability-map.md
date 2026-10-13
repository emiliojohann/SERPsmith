# SERPsmith runtime capability certification

Use JSON schema `serpsmith.runtime-capabilities.v1`. Full certification is bound to the agent, runtime, host, plugin/tool set, model policy, and permissions. A runtime-version-only update may retain baseline fixtures only after an effective post-update compatibility gate proves the pinned contract and stores a version-specific immutable proof. Never relabel old fixture strings as new tests. Material contract drift or a failed gate requires full recertification.

Required runtime identity:

- `runtime_id`
- `agent`
- `runtime_version`
- `host_id`
- `certified_at`
- optional `expires_at`
- optional `tool_policy_sha256`, `model_policy_sha256`, and `compatibility_proof` for a version-only extension; the proof must name the observed runtime version and successful no-delivery canaries and live Doctor result

Each capability entry contains `status: "passed"`, `effective: true`, and a non-secret `fixture` reference. Unattended certification requires:

`skill_load`, `filesystem`, `git`, `research`, `image_generate`, `image_convert`, `http_verify`, `secret_access`, `content`, `deploy`, `gsc`, `bing`, `indexnow`, `checkpoint_state`, `scheduler`, `tool_restriction`, `notify`, and `reconciliation`.

Validate with:

    node scripts/validate-runtime-capabilities.mjs CAPABILITY_MAP unattended

Tool names belong in fixture evidence, not the core capability names. OpenClaw is the first production-tested adapter. Other runtimes remain certification-pending until their exact map and fixtures pass.

Also validate a provider-neutral execution policy from `templates/execution-policy.example.json`. Record only opaque runtime model references. One-model runtimes may use the same reference for `reasoning` and `routine`; `deterministic` must remain a model-free process.

Certification result: manual-ready / unattended-ready / experimental / unsupported.
