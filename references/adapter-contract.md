# Runtime adapter contract

SERPsmith describes capabilities rather than vendor tool names. Runtimes may expose native tools or wrapper commands.

Deterministic wrapper adapters should:

- accept JSON on stdin or explicit non-secret arguments;
- return one JSON object on stdout;
- return diagnostics without secrets on stderr;
- use exit `0` for success, `64` for invalid input/configuration, `65` for a deterministic non-retryable response/content mismatch, `69` for retryable transport/provider failure, and `77` for non-retryable authentication/permission/ownership failure;
- enforce bounded timeouts;
- never print credentials or secret-bearing URLs;
- remain idempotent for a stable run key.

## Common response

```json
{
  "adapter": "name",
  "result": "accepted|verified|skipped|failed",
  "retryable": false,
  "status": 200,
  "class": "optional-sanitized-class",
  "run_key": "site-slot-slug"
}
```

## Capabilities

- `research`: query/source request -> sources, visible evidence, timestamp.
- `image_generate`: prompt/concept -> temporary asset reference and provider result.
- `image_convert`: source plus policy -> verified WebP/JPEG metadata.
- `content`: profile/article package -> deterministic repository edits and validation.
- `deploy`: commit/site -> deployment reference or configured auto-deploy wait result.
- `http_verify`: URL/headers/expectations -> sanitized status, MIME, canonical/metadata checks.
- `gsc`: property/sitemap -> accepted or classified failure.
- `ga4_check`: private profile plus explicit guarded credential reference -> sanitized property/hostname/read-access result.
- `ai_search_readiness`: profile plus fresh same-site evidence -> verified or action-required crawler, technical, content, llms.txt, and measurement status without a ranking score.
- `ga4_snapshot`: private profile, new external output path, and guarded credential reference -> immutable aggregate Organic Search snapshot for 7/28/90-day and preceding windows.
- `bing`: site/sitemap -> accepted or classified failure.
- `indexnow`: host/URLs -> accepted or classified failure.
- `checkpoint_state`: canonical versioned state plus expected revision -> atomic validated transition.
- `reconciliation`: canonical checkpoint -> running, waiting, stale, recovery-required, report-pending, failed, or complete classification.
- `notify`: sanitized final report plus external destination reference -> delivery result with a non-secret acknowledgment receipt.
- `prose`: clean prose -> advisory signals; optional.

Scheduling is external to an article run. The scheduler supplies exactly one profile, slot, authorization state, checkpoint namespace, lock namespace, retry policy, and reporting destination reference.

Native agent tools may satisfy a capability without a wrapper, but the runtime-specific guide must map inputs, outputs, timeouts, and failure classes explicitly.


The canonical v25 checkpoint schema and scheduler-independent completion rules are defined in `reliability-contract.md`. Runtime adapters must not add vendor tool names or session identifiers to that schema.
