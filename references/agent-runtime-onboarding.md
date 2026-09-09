# Agent runtime onboarding

SERPsmith provides multi-platform AI agent support. An agent can run manual mode when its environment maps every required capability. A normal chat without filesystem/Git and the other required tools cannot automate the workflow.

## Install

1. Put the complete SERPsmith directory where the runtime can read skills. If it supports AgentSkills, install one directory containing SKILL.md.
2. Otherwise configure every run to read the complete SKILL.md and referenced files.
3. Keep JSON profiles, secrets, checkpoints, locks, drafts, and reports outside skill and website repositories.
4. Complete a JSON capability certification from templates/runtime-capability-map.md for the exact runtime/version.
5. Run `node scripts/validate-runtime-capabilities.mjs MAP unattended` and the disposable end-to-end fixture before production.

## Manual capabilities

Map filesystem, normal Git, web research, image generation/conversion, bounded HTTP, secret retrieval, canonical checkpoint state, per-site locks, content execution, deployment, search notifications, and final reporting.

## Unattended requirements

Add scheduling, durable cross-session state, reliable locking, bounded retries, an enforceable action/tool boundary, and final delivery. Wrapper-only containment is not equivalent enforcement when raw execution remains available.

## Certification

Record runtime/version/platform, skill loading, capability map, credential injection, manual fixture, interruption/resume, failure injection, and unattended result. Never infer certification from another runtime. OpenClaw is the production-tested guarded reference integration. Hermes, Claude-based agent environments, ChatGPT agent environments, and all others remain certification-pending until independently tested.


## Universal run instruction

Give the exact runtime this instruction after replacing bracketed values:

> Read the complete SERPsmith SKILL.md, references/quickstart.md, references/agent-runtime-onboarding.md, references/repository-onboarding.md, references/site-profile-schema.md, references/search-engine-onboarding.md, and the website's reviewed SERPSMITH.md. Load only [ABSOLUTE PROFILE JSON]. Validate it first. Run read-only repository, deployment, credential-access, Google, Bing, IndexNow, and sitemap preflight for [SITE KEY]. Do not create or edit content, commit, push, deploy, notify search engines, change credentials, or change schedules. Return the sanitized readiness report and exact missing user actions.

Do not shorten that instruction until the runtime has a tested native skill loader that proves it reads every referenced file.

## Capability proof

A capability is mapped only when the operator records:

- the exact runtime name, version, platform, tool or adapter, and permission boundary;
- one passing fixture;
- one deliberate safe failure with the expected classification;
- sanitized evidence that no credential value or private destination was printed; and
- the owner who approved the mapping.

Filesystem access must prove bounded reads/writes. Git must prove identity, remote, upstream, clean-tree, fast-forward-only fetch/push behavior, and no force. HTTP must prove HTTPS, timeout, redirect, and status handling. Secrets must prove retrieval without logs. State and locks must prove interruption/resume and duplicate prevention.

## Agent categories

- Native AgentSkills runtimes: install the complete directory and verify the runtime loads SKILL.md plus referenced files.
- General coding agents: configure the system/project instruction to read the complete files, then map filesystem, Git, process, web, image, HTTP, secrets, state, and reporting tools explicitly.
- CI/CD agents: use a dedicated least-privilege identity, protected environment secrets, concurrency locks, immutable logs, and an approval environment before the push/deploy stage.
- Local desktop agents: keep profiles/state outside repositories and use OS secret storage or a reviewed credential file with restricted permissions.
- Remote hosted agents: verify repository scope, egress controls, secret redaction, persistent state, and teardown behavior.
- Chat-only agents: unsupported because they cannot prove repository, image, deployment, and search gates.

The same SERPsmith core applies to every category. Tool names and installation steps differ; safety and evidence requirements do not.

## Certification result

Classify the exact runtime/version as one of:

- `manual-ready`: every manual capability and failure test passed;
- `unattended-ready`: manual-ready plus enforced tool/action restrictions, durable locks/checkpoints, scheduler, interruption/resume, failure injection, and final delivery passed;
- `experimental`: incomplete evidence; no unattended publishing;
- `unsupported`: a required capability is absent.

A certification never transfers automatically to another agent, version, model, host, plugin set, or permission configuration.


## v25 completion proof

Use `references/reliability-contract.md`. Prove that an asynchronous wait remains `waiting_external`, a stale deadline classifies for recovery, a delivery failure remains `awaiting_report_ack`, and only an acknowledged receipt reaches `complete`. A successful scheduler or agent turn is never a substitute.
