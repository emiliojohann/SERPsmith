#!/bin/zsh
set -u
root="${0:A:h:h}"; script="$root/scripts/search-onboarding-report.mjs"; profile="$root/examples/generic-git-site-profile.json"; ready="$root/examples/search-onboarding-sample.json"
out="$(node "$script" "$ready" "$profile")" || exit 1
print -r -- "$out" | grep -q '"result":"ready"' || exit 1
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
expect64(){ node "$script" "$1" "$profile" >/dev/null 2>&1; [[ $? -eq 64 ]] || { print -u2 -- "expected rejection: $1"; exit 1; }; }
jq '.google.api_enabled=false' "$ready" > "$tmp/api.json"; node "$script" "$tmp/api.json" "$profile" >"$tmp/api.out" 2>/dev/null; [[ $? -eq 77 ]] || exit 1; grep -q 'Enable the Google Search Console API' "$tmp/api.out" || exit 1
secret_marker='-----BEGIN ''PRIVATE'' KEY----- forbidden'; jq --arg v "$secret_marker" '.notes=$v' "$ready" > "$tmp/secret.json"; expect64 "$tmp/secret.json"
jq '.google.property="sc-domain:other-site.com"' "$ready" > "$tmp/google.json"; expect64 "$tmp/google.json"
jq '.bing.site_url="https://other-site.com/"' "$ready" > "$tmp/bing.json"; expect64 "$tmp/bing.json"
jq '.indexnow.host="other-site.com"' "$ready" > "$tmp/indexnow.json"; expect64 "$tmp/indexnow.json"
jq '.site_key="other-site"' "$ready" > "$tmp/site.json"; expect64 "$tmp/site.json"
jq '.sitemap_url="https://example.com/other-sitemap.xml"' "$ready" > "$tmp/sitemap.json"; expect64 "$tmp/sitemap.json"
jq '.public_base_url="https://example.com/unexpected-path"' "$ready" > "$tmp/base-path.json"; expect64 "$tmp/base-path.json"
jq '.sitemap_url="https://example.com/sitemap.xml?token=forbidden"' "$ready" > "$tmp/sitemap-query.json"; expect64 "$tmp/sitemap-query.json"
jq '.google.unknown=true' "$ready" > "$tmp/nested-unknown.json"; expect64 "$tmp/nested-unknown.json"
print -r -- "search onboarding tests passed"
