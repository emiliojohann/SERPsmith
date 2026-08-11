# Quick start

Start with one manual reviewed article, not unattended publishing.

## 1. Runtime

Read `agent-runtime-onboarding.md` and complete `templates/runtime-capability-map.md`. SERPsmith provides multi-platform AI agent support, but the exact environment must provide every required capability. A normal chat without repository and execution tools cannot automate the workflow. Every runtime/version is certified separately.

## 2. Install

Place the complete SERPsmith directory where the runtime discovers AgentSkills, or require the agent to read the complete `SKILL.md` and references each run. Keep profiles, secrets, state, locks, drafts, and reports outside the package.

## 3. Repository

Follow `repository-onboarding.md` and copy `templates/site-repository-instructions.md` into the website as reviewed `SERPSMITH.md`. Confirm exact repository, normal-push branch/upstream, content adapter, paths, deployment, safe commands, and reviewed `SERPSMITH.md`. Never paste credentials into chat or Git.

## 4. JSON profile

Copy `examples/generic-git-site-profile.json` outside the package. The bundled validator accepts JSON only. YAML is allowed only if a runtime converts it to identical JSON and runs the bundled validator.

    node scripts/validate-profile.mjs /absolute/private/path/site-profile.json

Keep `autopilot_enabled` false.

## 5. Search services

Follow `search-engine-onboarding.md`, then run:

    node scripts/search-onboarding-report.mjs /external/evidence.json /absolute/private/path/site-profile.json

## 6. Google Analytics 4 (optional)

Follow `google-analytics-onboarding.md`. Enable both Analytics APIs, grant Viewer access, add the private numeric Property ID to the external profile, validate it, and run the exact property/hostname check.

After snapshots begin, follow `content-intelligence.md`. Recommendations remain advisory and are observed for at least 7 days and normally 14 days before they may become eligible for explicit owner authorization. The observation window never authorizes edits by itself.

## 7. Read-only preflight

Tell the agent to read the complete skill and repository instructions, use the selected JSON profile, and run preflight only. It must not create content, modify Git, commit, push, deploy, notify search engines, or change schedules.

## 8. Manual article

Review topic/evidence, article/citations, both image concepts, reciprocal links, and complete diff. Publish only after explicit approval and verify live.

## Universal Image Fallback

Image attempt limits and publication gates come from the shared core, not a site profile. SERPsmith reviews at most six generated candidates. If none passes every aesthetic quality gate, it publishes the highest-ranked relevant, safe, technically valid candidate under the existing authorization, records the exact exception, and recommends owner review. Unsafe, misleading, branded/text-filled, severely corrupted, missing, or technically invalid images still stop publication.

## 9. Unattended later

Require a successful manual run, runtime certification, profile-bound search readiness, explicit authorization/scope, stable slot, external checkpoints/locks, enforced tool boundary, and final reporting.
