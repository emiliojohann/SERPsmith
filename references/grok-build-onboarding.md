# Grok Build onboarding

SERPsmith runs in Grok Build as a portable Agent Skill, not as an MCP server. Grok Build must load the complete skill directory and provide every capability required by `references/agent-runtime-onboarding.md`.

## Status

Grok Build is designed to work with SERPsmith, but certification is pending until an exact Grok Build version, model, host, tool set, and permission configuration completes the runtime capability map and fixtures. Keep use manual and reviewed until then. Do not claim unattended readiness from another runtime's certification.

## Install

Install only the sanitized public SERPsmith release. Never install the private development repository or a directory containing real profiles, credentials, state, drafts, reports, or publication history.

When the public repository or release source is available, use the Agent Skills installer supported by the installed Grok Build version:

```bash
npx skills add [PUBLIC_SERPSMITH_SOURCE]
npx skills add blader/humanizer --global
```

Reload Grok Build when required, then verify that both `serpsmith` and `humanizer` are discoverable. The Humanizer skill must be reviewed version 2.9.1 or newer.

The exact public SERPsmith source must replace the placeholder above before release. Do not point public instructions at a private development repository.

## First safe test

Copy `examples/generic-git-site-profile.json` outside the skill directory, keep `autopilot_enabled` false, and replace only placeholder values needed by a disposable local fixture.

Give Grok Build the universal read-only run instruction from `references/agent-runtime-onboarding.md`. The first test must not create or edit content, commit, push, deploy, notify search engines, change credentials, or change schedules.

Run the bundled deterministic tests before a real site:

```bash
node scripts/test-live-http-check.mjs
/bin/zsh scripts/test-profile-validation.sh
/bin/zsh scripts/test-search-onboarding.sh
node scripts/test-ai-search-readiness.mjs
node scripts/test-google-analytics.mjs
node scripts/test-prune-completed-runs.mjs
/bin/zsh scripts/test-controlled-attempt.sh
/bin/zsh scripts/test-user-onboarding-docs.sh
```

## Capability map

Complete `templates/runtime-capability-map.md` for the exact Grok Build runtime. At minimum, prove skill/reference loading, bounded filesystem access, normal Git behavior, web research, image generation and inspection, bounded HTTP, secret retrieval without logs, content adapter execution, deployment verification, and final reporting.

Record one passing fixture and one deliberate safe failure for every mapped capability. Missing evidence means `experimental`, not `manual-ready`.

## Limits

- A normal Grok chat without filesystem, Git, execution, image, HTTP, secret, state, and approval tools is unsupported.
- MCP connections may supply individual missing tools, but MCP is not required merely to load the SERPsmith workflow.
- Wrapper-only command containment does not prove unattended safety when Grok Build retains unrestricted raw execution.
- Publication always requires the approvals defined by SERPsmith and the selected site profile.
