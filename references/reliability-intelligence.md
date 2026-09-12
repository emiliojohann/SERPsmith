# Reliability intelligence

SERPsmith records structured operational failures continuously and reviews them without granting itself permission to change code, configuration, schedules, sites, or releases.

Keep one private `serpsmith.reliability-ledger.v1` file per site outside every website and skill repository. Record only aggregate operational facts: site key, run key, stage, failure class, outcome, and timestamp. Never store prompts, article content, credentials, paths, provider payloads, chat content, or raw error text.

Use `scripts/reliability-intelligence.mjs` to initialize, record, review, and decide recommendations. Recording an event also evaluates the current 28-day window. A signature becomes eligible for owner review after either:

- at least three occurrences across at least two runs; or
- at least two terminal occurrences.

The ledger retains at most 180 days and bounded recommendation/decision history. A weekly review summarizes open evidence and catches patterns that have not crossed an immediate threshold. Routine retries and recovered attempts stay silent. Notify the owner only when a new recommendation becomes eligible or one terminal error has exhausted recovery.

Every recommendation is advisory and carries `authorization_required: true`. Record the owner's accepted, rejected, or implemented decision. A rejected pattern may become eligible again only after materially new evidence changes its count or latest occurrence.

The runtime worker may pass an `onReliabilityEvent` callback to `scripts/durable-worker.mjs`. The callback writes the event to the matching site ledger. Telemetry failure is reported on the worker result but never changes an already-settled queue outcome.

Completion: recurring failures are detected from bounded private evidence, the owner sees one actionable recommendation instead of attempt noise, and no self-modification or release occurs without explicit approval.
