# SERPsmith Guard

OpenClaw tool plugin for unattended SERPsmith jobs.

It replaces raw `exec` access with:

- `serpsmith_admit`: proves the effective Guard plugin and v27 finalization capabilities are present.
- `serpsmith_exec`: runs a shell attempt and converts process failure into structured data.
- `serpsmith_finalize`: validates canonical v27 state before delivery and after acknowledged delivery.
- `serpsmith_fail`: emits one intentional runtime error only after a gate is genuinely exhausted.

Configure `allowedRoots` before use. Restrict each SERPsmith job with a per-job tool allowlist that includes these tools and excludes raw execution.

## Clean install and validation

OpenClaw `2026.7.1-2` or newer must be installed on the host.

```bash
npm ci --ignore-scripts
npm audit --audit-level=high
npm run build
openclaw plugins validate --entry ./dist/index.js
```

This distributable package contains runtime source and build requirements only. Failure fixtures and test-runner files are excluded.
