#!/bin/zsh
set -euo pipefail
mode="submit"; if [[ "${1:-}" == "--check" ]]; then mode="check"; shift; fi
[[ ($mode == check && $# -eq 1) || ($mode == submit && $# -eq 2) ]] || { echo "bing result=failed class=usage" >&2; exit 64; }
site_url="$1"; sitemap_url="${2:-}"
[[ "$site_url" == https://* ]] || { echo "bing result=failed class=invalid_site_url" >&2; exit 64; }
[[ "$mode" == check || "$sitemap_url" == https://* ]] || { echo "bing result=failed class=invalid_sitemap_url" >&2; exit 64; }
bing_api_key="${SERPSMITH_BING_API_KEY:-}"
if [[ -z "$bing_api_key" ]] && command -v security >/dev/null 2>&1; then bing_api_key="$(security find-generic-password -a "${SERPSMITH_BING_KEYCHAIN_ACCOUNT:-serpsmith}" -s "${SERPSMITH_BING_KEYCHAIN_SERVICE:-openclaw-serpsmith-bing-webmaster-api-key}" -w 2>/dev/null || true)"; fi
[[ -n "$bing_api_key" ]] || { echo "bing result=failed class=credential_missing" >&2; exit 77; }
trap 'unset bing_api_key' EXIT INT TERM
encoded="$(jq -nr --arg v "$bing_api_key" '$v|@uri')"
call_bing(){ local method="$1"; shift; printf 'url = "https://ssl.bing.com/webmaster/api.svc/json/%s?apikey=%s"\n' "$method" "$encoded" | curl --silent --show-error --config - --max-time 30 "$@"; }
sites="$(call_bing GetUserSites)" || { echo "bing result=failed class=authentication_or_transport" >&2; exit 69; }
jq -e --arg site "$site_url" '.d | any(.Url == $site and .IsVerified == true)' >/dev/null 2>&1 <<<"$sites" || { echo "bing site=$site_url result=failed class=site_not_verified" >&2; exit 77; }
[[ "$mode" == check ]] && { echo "bing site=$site_url result=verified"; exit 0; }
body="$(jq -cn --arg siteUrl "$site_url" --arg feedUrl "$sitemap_url" '{siteUrl:$siteUrl,feedUrl:$feedUrl}')"
response="$(call_bing SubmitFeed --request POST --header 'Accept: application/json' --header 'Content-Type: application/json; charset=utf-8' --data-binary "$body" --write-out '\nHTTP_STATUS=%{http_code}')" || { echo "bing result=failed class=transport" >&2; exit 69; }
code="${response##*HTTP_STATUS=}"; payload="${response%$'\n'HTTP_STATUS=*}"
if [[ "$code" == 200 ]] && jq -e '.d == null' >/dev/null 2>&1 <<<"$payload"; then echo "bing site=$site_url sitemap=$sitemap_url status=200 result=accepted"; exit 0; fi
case "$code" in 401|403) cls="authentication_or_permission";;404) cls="endpoint_not_found";;429) cls="rate_limited";;5??) cls="bing_server";;*) cls="unexpected_response";;esac
echo "bing site=$site_url status=$code result=failed class=$cls" >&2
[[ "$code" == 401 || "$code" == 403 || "$code" == 404 ]] && exit 77
exit 69
