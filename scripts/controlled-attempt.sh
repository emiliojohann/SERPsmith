#!/bin/zsh

set -u

serpsmith_usage() {
  print -u2 -- "usage: controlled-attempt.sh STAGE ATTEMPT REASON -- COMMAND [ARG ...]"
}

if (( $# < 5 )); then
  serpsmith_usage
  exit 64
fi

serpsmith_stage=$1
serpsmith_attempt=$2
serpsmith_reason=$3
shift 3

case "$serpsmith_stage" in
  ''|*[!a-z0-9_-]*) print -u2 -- "controlled-attempt: invalid stage"; exit 64 ;;
esac
case "$serpsmith_attempt" in
  ''|*[!0-9]*) print -u2 -- "controlled-attempt: invalid attempt"; exit 64 ;;
esac
case "$serpsmith_reason" in
  ''|*[!a-z0-9_-]*) print -u2 -- "controlled-attempt: invalid reason"; exit 64 ;;
esac

if [[ $1 != "--" ]]; then
  serpsmith_usage
  exit 64
fi
shift

if (( $# == 0 )); then
  serpsmith_usage
  exit 64
fi

serpsmith_output=$(mktemp /tmp/serpsmith-attempt.XXXXXX) || {
  print -u2 -- "controlled-attempt: cannot create temporary output"
  exit 70
}
trap 'rm -f "$serpsmith_output"' EXIT

"$@" >"$serpsmith_output" 2>&1
serpsmith_rc=$?

if (( serpsmith_rc == 0 )); then
  command cat -- "$serpsmith_output"
  print -- "SERPSMITH_ATTEMPT stage=$serpsmith_stage attempt=$serpsmith_attempt status=passed"
else
  print -- "SERPSMITH_ATTEMPT stage=$serpsmith_stage attempt=$serpsmith_attempt status=failed reason=$serpsmith_reason command_exit=$serpsmith_rc"
fi

exit 0
