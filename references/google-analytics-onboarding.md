# Google Analytics 4 onboarding

Use this after the site already has a GA4 property and web data stream. The existing Search Console service account may be reused.

## 1. Enable both Google APIs

In the owner-controlled Google Cloud project used by the service account, enable:

- Google Analytics Data API: `analyticsdata.googleapis.com`
- Google Analytics Admin API: `analyticsadmin.googleapis.com`

The Data API reads aggregate reports. The Admin API verifies the exact property and web-stream hostname. Both are required.

## 2. Add the service account as Viewer

Repeat for every intended GA4 property:

1. Open **Admin**.
2. Under the property, open **Property access management**.
3. Select **+**, then **Add users**.
4. Enter the service account's `client_email` address.
5. Select **Viewer** only.
6. Save.

Keep the owner's normal Google account as Administrator. Do not grant Editor or Administrator to the runtime identity.

## 3. Copy the numeric GA4 Property ID

Open **Admin -> Property settings -> Property details**. Copy the numeric GA4 Property ID.

Do not use the public `G-...` Measurement ID, Google tag ID, Search Console property string, or Analytics account ID. Store the numeric property ID only in the private external site profile.

## 4. Verify the web stream

Under **Admin -> Data streams**, open the site's web stream. Its Website URL must use the exact production hostname in the SERPsmith profile. Correct accidental cross-site streams before continuing.

## 5. Add analytics to the private profile

```json
"analytics": {
  "adapter": "google-analytics-data-v1",
  "property_id": "123456789",
  "expected_hostname": "example.com",
  "windows_days": [7, 28, 90],
  "organic_channel": "Organic Search",
  "key_events": []
}
```

Replace the dummy values privately. Add only event names already deployed and visible in GA4. An empty `key_events` array is correct during initial observation.

## 6. Provide the credential reference

Keep the service-account JSON in the runtime secret store. The guarded runtime resolves its reviewed file reference and passes that path directly to the adapter. Reusing the Search Console credential is allowed when it is the same explicitly authorized identity.

Never place the credential path, private key, client email, or token in the profile, Git, checkpoints, chat, or reports.

## 7. Validate and check

Validate the profile:

    node scripts/validate-profile.mjs /absolute/private/path/site-profile.json

Then run the read-only access check through the guarded execution capability:

    node scripts/google-analytics-check.mjs /absolute/private/path/site-profile.json /reviewed/credential-reference.json

Success returns a sanitized `verified` result without property IDs, account IDs, credential paths, or tokens.

## 8. Create an immutable snapshot

Choose a new timestamped path below the selected site's external state root:

    node scripts/google-analytics-snapshot.mjs /absolute/private/path/site-profile.json /absolute/external/state/<site_key>/ga4-snapshot-YYYY-MM-DD.json /reviewed/credential-reference.json

The output path must be absolute, outside the website repository, include the exact site key as a path segment, and not already exist. Reuse a verified snapshot for no more than one day.

## 9. Configure events deliberately

Basic automatic events are diagnostics, not business outcomes. Confirm a real primary CTA event on the live site, verify that exact event name appears in GA4, then add it to `key_events`. Do not invent event names or call a page view a conversion.

Instrument the event only after the owner approves the website change. Use a stable lowercase snake_case name, fire it only after the intended successful action or outbound CTA click, and include no email address, form text, name, user ID, or other personal data. Useful examples are `app_store_click`, `github_download_click`, or `newsletter_signup_success`, but select the name from the site's real primary outcome.

Verify the event in GA4 DebugView or Realtime, then confirm it appears in an adapter snapshot before adding the exact name to `key_events`. Marking it as a GA4 key event is optional and remains an owner Analytics configuration choice.

## 10. Begin the observation period

Let SERPsmith collect daily immutable snapshots. Recommendations remain `observing` for at least 7 days and normally 14 days. Follow `content-intelligence.md`; elapsed time alone never authorizes a site change.

## Failure actions

- Admin or Data API disabled: enable both named APIs in the same Cloud project.
- Permission denied: add the exact service account email as Viewer.
- Property not found: use the numeric Property ID from Property details.
- Host mismatch: correct the property, stream, or profile; never accept another site's data.
- No rows: allow for GA4 processing delay or low traffic; a matching web stream can still verify binding.
- Rate limit or Google 5xx: use bounded retries.
- Credential or permission failure: correct access; do not retry blindly.

## Revocation

Remove the service account from Property access management. If it is also used for Search Console, GA4 revocation does not revoke Search Console separately. Rotate or delete its key through Google Cloud when required.
