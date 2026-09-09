# SERPsmith runtime capability certification

Use JSON schema `serpsmith.runtime-capabilities.v1`. Certification is bound to the exact agent, runtime version, host, plugin/tool set, model policy, and permissions; repeat it whenever any changes.

Required runtime identity:

- `runtime_id`
- `agent`
- `runtime_version`
- `host_id`
- `certified_at`
- optional `expires_at`

Each capability entry contains `status: "passed"`, `effective: true`, and a non-secret `fixture` reference. Unattended certification requires:

`skill_load`, `filesystem`, `git`, `research`, `image_generate`, `image_convert`, `http_verify`, `secret_access`, `content`, `deploy`, `gsc`, `bing`, `indexnow`, `checkpoint_state`, `scheduler`, `tool_restriction`, `notify`, and `reconciliation`.

Validate with:

    node scripts/validate-runtime-capabilities.mjs CAPABILITY_MAP unattended

Tool names belong in fixture evidence, not the core capability names. OpenClaw is the first production-tested adapter. Other runtimes remain certification-pending until their exact map and fixtures pass.

Certification result: manual-ready / unattended-ready / experimental / unsupported.
