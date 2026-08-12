# Site profile schema

Real profiles stay outside the repository. The bundled validator accepts JSON only. YAML requires conversion to identical JSON before bundled validation.

Every active profile declares `core_policy_version: serpsmith-core-v9`.

## Required

`core_policy_version`, `site_key`, `repository`, `branch`, `remote`, `public_base_url`, `article_route`, `content_adapter`, `image_directory`, `image_policy`, `deployment_adapter`, `checkpoint_root`, `lock_root`, `timezone`, `editorial_guardrails`, `repository_instruction_files`, and `autopilot_enabled`.

Repository content/image/discovery/instruction paths are relative and traversal-free. Repository/state roots are absolute. State stays outside the repository and is namespaced by site_key. Timezones are valid IANA names.

## Search

Profiles contain only public `search_console_property`, `bing_site_url`, `indexnow_host`, `sitemap_url`, and `required_notifications`. `sitemap_url` is mandatory whenever Google Search Console or Bing Webmaster Tools notification is required. Identifiers must cover the profile host. Evidence is validated with both evidence and profile paths. Unknown fields, secret-like values, wrong sites, and required-flag mismatches fail closed.

## Google Analytics 4

The optional `analytics` object enables the shared read-only adapter:

- `adapter`: exactly `google-analytics-data-v1`.
- `property_id`: private numeric GA4 Property ID, never the public `G-...` measurement ID.
- `expected_hostname`: exact lowercase profile hostname.
- `windows_days`: exactly `[7, 28, 90]` in core-v9.
- `organic_channel`: exactly `Organic Search` in core-v9.
- `key_events`: unique verified GA4 event names; an empty array is valid during initial observation.

Credential contents and paths are never profile fields. Numeric property IDs, real profiles, snapshots, and reports remain private and external. Follow `google-analytics-onboarding.md`.

## Unattended

When autopilot is true, require recorded owner approval/scope, schedule weekdays/time/timezone/slot, matching profile timezone, notification adapter, explicit required notifications, and `validation_policy.secret_scan_required: true`.

Runtime preflight still verifies adapters, Git, credentials, ownership, deployment, scheduler payload, and tool restrictions.

## Completed-run retention

Completed run artifacts are operational state, not the canonical article inventory. The current repository, sitemap, and live site remain canonical. Keep exactly the latest three completed article runs per site after confirmed final-report delivery. Preserve all resumable incomplete runs, analytics snapshots and recommendation ledgers, and locks. Use the bundled dry-run-by-default retention command documented in `retention.md`.

## Workflow

Copy the current JSON example, validate, run repository/search preflight, complete a manual run, then separately authorize unattended mode. All active profiles use the same core version.


## Exact field contract

The validator uses a top-level allowlist. A field not listed here is rejected instead of silently ignored.

- Identity and Git: `site_key`, `repository`, `branch`, `remote`, `public_base_url`, `repository_instruction_files`.
- Content and deployment: `article_route`, `content_adapter`, `image_directory`, `image_policy`, optional `image_direction`, `sitemap_file`, `llms_file`, `llms_full_file`, `deployment_adapter`.
- Search: `sitemap_url`, `search_console_property`, `bing_site_url`, `indexnow_host`, `required_notifications`.
- Analytics: optional `analytics` with the exact core-v9 contract above.
- State and policy: `checkpoint_root`, `lock_root`, `timezone`, `editorial_guardrails`, `validation_policy`, optional `validation_commands`, `crawler_user_agents`, `internal_link_minimum`, `external_link_limits`, `product_source`, `robots_policy`, `prose_adapter`.
- Unattended only: `autopilot_enabled`, `authorization`, `schedule`, `notification_adapter`.

Adapter objects may include adapter-specific configuration because different Git repositories store content and deploy differently. Every adapter-specific key ending in `file`, `directory`, or `path` is still required to be a traversal-free repository-relative path. The runtime must verify the named adapter exists and supports every supplied option before mutation.

## Secret boundary

Profiles contain configuration, never credentials. The validator rejects secret-shaped field names anywhere in the object and common private-key/token value formats. This is defense in depth, not a substitute for the pre-commit and pre-push secret scan. Keep service-account files, API keys, OAuth material, SSH keys, chat destinations, account IDs, and credential paths in the runtime secret/configuration layer outside Git.

## URL and site isolation

`public_base_url` is an HTTPS origin. Sitemap and Bing URLs must use that origin and must not contain credentials, query strings, or fragments. Google Domain properties must cover the host; Google URL-prefix properties must use the same origin. IndexNow host must equal the public host. The search readiness report must receive both the evidence file and the selected profile and requires the evidence sitemap URL to exactly match the configured sitemap URL.

## Unattended authorization details

Valid unattended configuration requires:

1. `autopilot_enabled: true`;
2. external owner authorization with a non-empty scope;
3. a schedule containing unique lowercase weekday names, 24-hour local time, the same IANA timezone as the profile, and a stable slot key;
4. a named final-report adapter;
5. explicit, unique required search notifications;
6. external site-namespaced checkpoint and lock roots; and
7. `validation_policy.secret_scan_required: true`.

The core policy always excludes force pushes, history rewrites, conflict resolution, credential changes, product/template changes, unrelated edits, schedule changes, and bypassing failed gates, even if profile prose claims otherwise.
