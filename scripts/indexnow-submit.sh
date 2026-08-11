#!/bin/zsh
set -euo pipefail
mode="submit"; if [[ "${1:-}" == "--check" ]]; then mode="check"; shift; fi
[[ ($mode == check && ($# -eq 2 || $# -eq 3)) || ($mode == submit && ($# -eq 4 || $# -eq 5)) ]] || { echo "indexnow result=failed class=usage" >&2; exit 64; }
repo="$1"; host="$2"; shift 2
[[ -d "$repo/.git" ]] || { echo "indexnow result=failed class=repo_missing" >&2; exit 64; }
[[ "$host" != *"://"* && "$host" != *"/"* ]] || { echo "indexnow result=failed class=invalid_host" >&2; exit 64; }
if [[ "$mode" == submit ]]; then article_url="$1"; sitemap_url="$2"; key_file="${3:-}"; [[ "$article_url" == "https://$host/"* && "$sitemap_url" == "https://$host/"* ]] || { echo "indexnow result=failed class=url_host_mismatch" >&2; exit 64; }; else key_file="${1:-}"; fi
valid_file(){ local f="$1"; [[ "$f" != *"/"* && "$f" == *.txt ]] || return 1; git -C "$repo" ls-files --error-unmatch -- "$f" >/dev/null 2>&1 || return 1; local value="$(<"$repo/$f")"; [[ "$value" =~ '^[A-Fa-f0-9]{32,64}$' && "$f" == "$value.txt" ]]; }
if [[ -n "$key_file" ]]; then valid_file "$key_file" || { echo "indexnow result=failed class=invalid_key_file" >&2; exit 77; }
else
  matches=(); while IFS= read -r f; do [[ "$f" != *"/"* ]] && valid_file "$f" && matches+=("$f"); done < <(git -C "$repo" ls-files '*.txt')
  [[ ${#matches[@]} -eq 1 ]] || { echo "indexnow result=failed class=key_file_ambiguous_or_missing" >&2; exit 77; }; key_file="${matches[1]}"
fi
key="$(<"$repo/$key_file")"; key_url="https://$host/$key_file"
live="$(curl --fail --silent --show-error --max-time 30 "$key_url")" || { unset key; echo "indexnow result=failed class=key_location_unreachable" >&2; exit 77; }
[[ "$live" == "$key" ]] || { unset key live; echo "indexnow result=failed class=key_content_mismatch" >&2; exit 77; }; unset live
[[ "$mode" == check ]] && { unset key; echo "indexnow host=$host result=verified"; exit 0; }
body="$(jq -cn --arg host "$host" --arg key "$key" --arg keyLocation "$key_url" --arg article "$article_url" --arg sitemap "$sitemap_url" '{host:$host,key:$key,keyLocation:$keyLocation,urlList:[$article,$sitemap]}')"; unset key
code="$(printf '%s' "$body" | curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 30 --header 'Content-Type: application/json; charset=utf-8' --data-binary @- https://api.indexnow.org/indexnow)" || { echo "indexnow result=failed class=transport" >&2; exit 69; }
case "$code" in 200|202) echo "indexnow host=$host status=$code result=accepted"; exit 0;;400) cls="invalid_request";;403) cls="key_or_permission";;422) cls="url_host_mismatch";;429) cls="rate_limited";;5??) cls="server";;*) cls="unexpected_response";;esac
echo "indexnow host=$host status=$code result=failed class=$cls" >&2
[[ "$code" == 403 || "$code" == 422 ]] && exit 77
exit 69
