#!/bin/zsh
set -u
root="${0:A:h:h}"
public_readme="$root/templates/public/README.md"
public_version="$root/templates/public/VERSION"
[[ -f "$public_readme" ]] || public_readme="$root/README.md"
[[ -f "$public_version" ]] || public_version="$root/VERSION"
for file in references/repository-onboarding.md references/search-engine-onboarding.md references/google-analytics-onboarding.md references/google-analytics-integration.md references/content-intelligence.md references/ai-search-discoverability.md references/retention.md references/agent-runtime-onboarding.md templates/site-repository-instructions.md templates/runtime-capability-map.md; do [[ -f "$root/$file" ]] || exit 1; done
grep -q 'generic-git-site-profile.json' "$root/references/quickstart.md" || exit 1
! grep -q 'site.yaml' "$root/references/quickstart.md" || exit 1
grep -q 'Google Analytics Data API' "$root/references/google-analytics-onboarding.md" || exit 1
grep -q 'Google Analytics Admin API' "$root/references/google-analytics-onboarding.md" || exit 1
grep -q 'Property access management' "$root/references/google-analytics-onboarding.md" || exit 1
grep -q 'Viewer' "$root/references/google-analytics-onboarding.md" || exit 1
grep -q 'numeric GA4 Property ID' "$root/references/google-analytics-onboarding.md" || exit 1
grep -q 'google-analytics-check.mjs' "$root/references/google-analytics-onboarding.md" || exit 1
grep -q 'newsletter_signup_success' "$root/references/google-analytics-onboarding.md" || exit 1
grep -q 'eligible_for_owner_authorization' "$root/references/content-intelligence.md" || exit 1
grep -q 'at least 7 days and normally 14 days' "$root/references/content-intelligence.md" || exit 1
grep -q 'two comparable evidence snapshots' "$root/references/content-intelligence.md" || exit 1
grep -q 'explicit owner approval' "$root/references/content-intelligence.md" || exit 1
grep -q 'production-tested reference integration' "$root/references/compatibility.md" || exit 1
grep -q 'Claude-based agent environments' "$root/references/compatibility.md" || exit 1
grep -q 'ChatGPT agent environments' "$root/references/compatibility.md" || exit 1
grep -q 'Version: `v0.4.0-beta.1`' "$public_readme" || exit 1
grep -q 'multi-platform AI agent support' "$public_readme" || exit 1
[[ "$(<"$public_version")" == 'v0.4.0-beta.1' ]] || exit 1
grep -q 'ai-search-readiness.mjs' "$public_readme" || exit 1
grep -q 'OAI-SearchBot' "$root/references/ai-search-discoverability.md" || exit 1
grep -q 'PerplexityBot' "$root/references/ai-search-discoverability.md" || exit 1
grep -q 'does not promise' "$root/references/ai-search-discoverability.md" || exit 1
grep -q 'google-search-console-check.mjs' "$root/references/search-engine-onboarding.md" || exit 1
grep -q 'Settings.*API Access' "$root/references/search-engine-onboarding.md" || exit 1
grep -q 'Do not place the real value on the command line' "$root/references/search-engine-onboarding.md" || exit 1
! grep -q "SERPSMITH_BING_API_KEY='injected-by-secret-manager'" "$root/references/search-engine-onboarding.md" || exit 1
grep -q 'public verification value' "$root/references/search-engine-onboarding.md" || exit 1
grep -q 'Universal run instruction' "$root/references/agent-runtime-onboarding.md" || exit 1
grep -q 'CI/CD agents' "$root/references/agent-runtime-onboarding.md" || exit 1
grep -q 'Chat-only agents: unsupported' "$root/references/agent-runtime-onboarding.md" || exit 1
grep -q 'exact sitemap URL' "$root/references/search-engine-onboarding.md" || exit 1
grep -q 'same-site sitemap' "$root/references/search-engine-onboarding.md" || exit 1
grep -q 'top-level allowlist' "$root/references/site-profile-schema.md" || exit 1
grep -q 'manual-ready / unattended-ready / experimental / unsupported' "$root/templates/runtime-capability-map.md" || exit 1
! grep -q 'Telegram delivery configuration' "$root/references/unattended-run.md" || exit 1
manifest="$root/templates/public/manifest.json"
if [[ -f "$manifest" ]]; then
  for target in references/agent-runtime-onboarding.md references/google-analytics-onboarding.md references/google-analytics-integration.md references/content-intelligence.md scripts/google-analytics-config.mjs scripts/google-analytics-client.mjs scripts/google-analytics-snapshot-core.mjs scripts/google-analytics-check.mjs scripts/google-analytics-snapshot.mjs scripts/test-google-analytics.mjs scripts/google-search-console-check.mjs scripts/bing-webmaster-submit.sh scripts/indexnow-submit.sh scripts/test-profile-validation.sh references/ai-search-discoverability.md scripts/ai-search-readiness-core.mjs scripts/ai-search-readiness.mjs scripts/test-ai-search-readiness.mjs examples/ai-search-readiness-evidence.json templates/runtime-capability-map.md; do grep -q "\"target\": \"$target\"" "$manifest" || exit 1; done
fi
/bin/zsh "$root/scripts/test-profile-validation.sh" || exit 1
/bin/zsh "$root/scripts/test-search-onboarding.sh" || exit 1
node "$root/scripts/test-ai-search-readiness.mjs" || exit 1
node "$root/scripts/test-google-analytics.mjs" || exit 1
node "$root/scripts/test-prune-completed-runs.mjs" || exit 1
print -r -- "user onboarding documentation tests passed"
