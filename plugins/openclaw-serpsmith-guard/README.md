# SERPsmith Guard

OpenClaw tool plugin for unattended SERPsmith jobs.

It replaces raw `exec` access with:

- `serpsmith_exec`: runs a shell attempt and converts every process failure into structured data instead of a runtime tool error.
- `serpsmith_finalize`: validates the durable SERPsmith checkpoint after the final report is prepared and before it is delivered.
- `serpsmith_fail`: emits one intentional runtime error only after a gate is genuinely exhausted.

Configure `allowedRoots` in the plugin entry before use. Restrict each SERPsmith cron job with a per-job tool allowlist that includes these tools and excludes raw `exec`.

## Clean install and validation

OpenClaw `2026.7.1-2` or newer must be installed on the host. The package keeps
OpenClaw as an optional peer because the runtime provides it.

```bash
npm ci --ignore-scripts
npm audit --audit-level=high
npm test
npm run build
openclaw plugins validate --entry ./dist/index.js
```

The local TypeScript declaration and Vitest shim support clean source builds and
tests without copying the OpenClaw package into this repository. The compiled
plugin still imports the host-provided OpenClaw plugin SDK at runtime.
