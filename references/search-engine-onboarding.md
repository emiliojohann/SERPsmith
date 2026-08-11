# Search-engine onboarding

Use this profile-bound flow. Credentials stay in the runtime secret store.

## Google Cloud and Search Console API

1. Create/select a dedicated Google Cloud project.
2. Enable Google Search Console API under APIs & Services > Library.
3. Create a site-neutral service account without broad Cloud roles.
4. Prefer short-lived credentials; otherwise create a JSON key.
5. Never commit/paste it. Store outside Git or in the runtime secret manager.
6. Copy only `client_email`.
7. In the exact Search Console property, open Settings > Users and permissions > Add user.
8. Add it as Full user; Owner is unnecessary for sitemap management.
9. Record the exact property and sitemap URL.
10. Expose the credential only through `SERPSMITH_GSC_CREDENTIALS`.
11. Read-only test:

    SERPSMITH_GSC_CREDENTIALS=/private/path/search-console.json node scripts/google-search-console-check.mjs sc-domain:example.com https://example.com/sitemap.xml

12. Approved submission:

    SERPSMITH_GSC_CREDENTIALS=/private/path/search-console.json node scripts/google-search-console-submit.mjs sc-domain:example.com https://example.com/sitemap.xml

Google Search Console submission here means sitemap submission. It is a discovery hint, not a per-article indexing request or guarantee. The Search Console URL Inspection API can report a page's known index state but cannot request indexing. Google's separate Indexing API is limited to pages with `JobPosting` or livestream `BroadcastEvent` structured data; do not use it for ordinary articles.

Revoke the Search Console user, delete/disable its key, and remove the runtime secret. Rotate by testing the replacement before deleting the old key.

Official: https://developers.google.com/webmaster-tools/ , https://developers.google.com/webmaster-tools/v1/sitemaps , and https://cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys

## Bing Webmaster Tools

1. Add/import and verify the exact site.
2. Open Settings > API Access and generate an API key.
3. Configure the runtime secret manager to inject `SERPSMITH_BING_API_KEY` into the adapter process; macOS may use the reviewed Keychain fallback. Do not place the real value on the command line.
4. Record the verified site and sitemap URLs.
5. Read-only test:

    zsh scripts/bing-webmaster-submit.sh --check https://example.com/

6. Approved submission:

    zsh scripts/bing-webmaster-submit.sh https://example.com/ https://example.com/sitemap.xml

Revoke/rotate in Bing and update the runtime secret. Never type a real key into shell history.

Official: https://learn.microsoft.com/en-us/bingwebmaster/

## IndexNow

The IndexNow key is a public verification value served by the website, not an account password. Its filename and value are necessarily public on the site and may be supplied locally to the adapter. Do not copy the raw value into profiles, readiness evidence, reports, chat, or unrelated logs.

1. Generate one 32-64 character hexadecimal key.
2. Create a root `<key>.txt` whose complete contents equal the key.
3. Commit through review, deploy, and verify live contents.
4. Read-only test:

    zsh scripts/indexnow-submit.sh --check /absolute/site/repo example.com '<key>.txt'

5. Approved submission:

    zsh scripts/indexnow-submit.sh /absolute/site/repo example.com https://example.com/blog/new-article https://example.com/sitemap.xml '<key>.txt'

Omission of filename is backward-compatible only when exactly one valid root-level tracked key file exists.

Official: https://www.indexnow.org/documentation

## Profile-bound evidence

Start from `examples/search-onboarding-sample.json`:

    node scripts/search-onboarding-report.mjs /external/evidence.json /absolute/private/path/site-profile.json

Unknown fields, secret-like values, profile/site mismatches, cross-domain identifiers, and required-flag mismatches fail closed. Exit 0 means required integrations are ready, 64 invalid/unsafe evidence, and 77 user action required.


## What the user must provide

For each site, the operator collects only these public values in the private profile: canonical HTTPS origin, exact sitemap URL, Google Search Console property identifier, Bing verified site URL, IndexNow host, and which notifications are required. The user must complete ownership actions in Google and Bing; SERPsmith cannot bypass them.

The runtime stores Google credentials and the Bing API key outside the profile and evidence. The IndexNow key file is intentionally public and its filename may be supplied locally to the adapter, but its raw value is not copied into profiles, readiness evidence, reports, prompts, chat, or unrelated logs.

## Adapter result contract

Run read-only checks before building the readiness evidence:

- Google check proves the credential can access the exact property as Full user or Owner and that the same-site sitemap is live.
- Bing check proves the API credential lists the exact site as verified.
- IndexNow check proves the reviewed root key file is Git-tracked, correctly named, contains a valid key, and has identical live contents.
- A separate HTTPS check proves the configured sitemap URL is live and parseable.

Only boolean results and public identifiers enter the evidence JSON. Never hand-edit a failed boolean to true. Preserve the sanitized adapter result that produced it.

## Completion checklist

Search onboarding is complete only when:

- Google Cloud project selected, Search Console API enabled, service account created, credential stored outside Git, service-account email added to the exact property, Full user access verified, and sitemap verified;
- Bing site added/imported, ownership verified, API access created, credential stored outside Git, exact site returned as verified, and sitemap verified;
- IndexNow root key file committed and deployed, exact live contents verified, and the adapter can read it;
- evidence and selected profile pass `search-onboarding-report.mjs`; and
- the first sitemap/URL submission remains a separately approved mutation.

If an integration is optional, report it as skipped or action-required; never silently claim it is connected.
