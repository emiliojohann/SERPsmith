# Troubleshooting

SERPsmith stops safely instead of guessing. A stop is often protection, not a crash.

## Invalid or incomplete profile

Cause: missing field, unresolved placeholder, mismatched URL, unknown content layout, or required adapter absent.

Action: correct the external profile and rerun preflight. Do not enable autopilot.

## Dirty or diverged repository

Cause: uncommitted work, wrong branch, upstream changes, or local/remote divergence.

Action: preserve the repository unchanged. Resolve the state manually. SERPsmith must not merge, rebase, stash, discard, or force-push automatically.

## Missing credentials or ownership

Cause: credential unavailable, wrong permission, unverified search property, or inaccessible secret manager.

Action: correct access outside the repository. Never paste credentials into chat, profiles, logs, or commands that expose them.

## Google Analytics check or snapshot fails

Cause: Analytics Data API or Analytics Admin API disabled, service account missing Viewer access, wrong numeric Property ID, public `G-...` ID used by mistake, hostname/stream mismatch, stale credential, or transient Google failure.

Action: follow `google-analytics-onboarding.md`. Keep the profile and repository unchanged until the bundled check verifies exact property/hostname binding. Never try nearby property IDs, combine sites, broaden permissions beyond Viewer, or fall back to another site's data. A missing snapshot blocks analytics-driven decisions, not an otherwise authorized publication unless that run explicitly requires analytics evidence.

## No acceptable topic

Cause: duplicate/cannibalizing intent, weak evidence, unsupported claims, or poor site fit.

Action: record the rejection and stop the slot safely. Do not publish filler.

## Image generation fails

Cause: provider timeout/rate limit, invalid output, artifacts, text, misleading symbolism, or no candidate passing the rubric.

Recovery: review at most six generated candidates. If none passes every quality gate, publish the highest-ranked fallback-eligible candidate and mark the report `best_available_image_fallback` with the exact clarity or non-destructive responsive-composition exception plus an owner-review recommendation. Stop only when every candidate fails a hard safety/usability gate or required derivatives cannot be produced.

Action: use the bounded six-candidate process from `image-system.md`. If no candidate passes every quality gate, publish the best fallback-eligible candidate and disclose the exact exception. Preserve the article package and leave it unpublished only when no candidate passes the hard safety/usability gates or required derivatives cannot be produced.

## Deployment is delayed after push

Cause: propagation delay or deployment provider outage.

Action: resume live verification against the existing commit. Do not create a second article or publication commit and do not roll back automatically.

## Live verification reports curl exit 23

Cause: a live response was streamed into an early-exit matcher such as `grep -q` or `head`. The matcher succeeded and closed the pipe before curl finished writing, so curl reported a false write failure even though the endpoint may be healthy.

Action: treat this as a local verifier defect, not a deployment or transport failure. Use `node scripts/live-http-check.mjs` for status, MIME, and marker checks. For additional semantic checks, download the complete response to a temporary file and inspect the file. Retry the same verification checkpoint without republishing, and record the recovery as `matcher_corrected`, not `transient_transport_failure`.

## Search notification fails after publication

Cause: provider timeout, rate limit, authentication, property ownership, or endpoint failure.

Action: keep the live article. Retry only the incomplete notification checkpoint when retryable. Never republish the article.

## Recovered check still marks the scheduler run failed

Cause: a retryable diagnostic, calibration probe, or brittle matcher was invoked directly and escaped as a raw nonzero runtime tool call. The later retry may pass, but the scheduler can still classify the complete job from the earlier uncaught failure.

Action: confirm the durable checkpoint and live state. For future attempts, invoke the entire retryable command through `/bin/zsh /absolute/path/to/scripts/controlled-attempt.sh`; never execute the wrapper path directly or depend on its executable permission. Do not wrap only part of a pipeline and do not reproduce the wrapper inline. Record the structured result. Only an exhausted or immediately non-retryable gate may fail the runtime call. Do not change scheduler behavior to conceal the defect.

If the final checkpoint is complete but the scheduler reports an earlier Bash failure, treat that as a SERPsmith containment regression. Identify the direct retryable invocation, add it to regression coverage, and correct SERPsmith rather than OpenClaw or the schedule.

## Final report fails

Cause: messaging adapter unavailable.

Action: preserve the completed checkpoint and retry reporting only. Do not rerun publication.

## Duplicate prevention activates

Cause: the stable run key, slug, commit, sitemap entry, or notification is already recorded.

Action: resume the first incomplete checkpoint. Never create a replacement article for the same slot.

## What a failure report should contain

Include site key, stable run key, failed stage, completed checkpoints, attempt count, safe current state, and exact operator action. Exclude credentials, tokens, private paths, account IDs, and secret-bearing URLs.

## Scheduler still fails after recovered shell work

If publication completes but the scheduler records a raw command failure, inspect the live job payload. A controlled wrapper in prose is insufficient when raw execution remains available.

For OpenClaw:

1. Confirm the SERPsmith Guard plugin is loaded and exposes `serpsmith_exec`, `serpsmith_finalize`, and `serpsmith_fail`.
2. Confirm the production job's stored tool allowlist excludes `exec`, `bash`, `shell`, and `process`.
3. Confirm the cron expression, timezone, delivery, model, and timeout were not changed.
4. Run plugin build, unit tests, validation, and doctor.
5. Do not claim the architecture fixed until a real unattended run both completes its checkpoint and is recorded successful by the scheduler.
## Content Intelligence

- **Recommendation is younger than seven days:** keep it `observing`; do not request a page mutation yet.
- **Fourteen days elapsed but evidence is weak:** mark `insufficient_evidence` or continue observing. Time alone does not promote a recommendation.
- **Search Console and GA4 disagree:** verify dates, hostname/property binding, channel filter, indexing state, and recent deployments; use the longer window.
- **Recommendation is eligible:** show the exact URLs and proposed diff and request explicit owner approval. Do not treat eligibility as permission.
- **A change was just deployed:** enter the 7–14 day `measuring` cooldown and avoid stacking another optimization on the same page.
