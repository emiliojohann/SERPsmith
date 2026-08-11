#!/bin/zsh

set -eu

serpsmith_script_dir=${0:A:h}
serpsmith_wrapper="$serpsmith_script_dir/controlled-attempt.sh"
serpsmith_tmp_dir=$(mktemp -d /tmp/serpsmith-wrapper-test.XXXXXX)
trap 'rm -rf "$serpsmith_tmp_dir"' EXIT

command cp -- "$serpsmith_wrapper" "$serpsmith_tmp_dir/controlled-attempt.sh"
command chmod 600 "$serpsmith_tmp_dir/controlled-attempt.sh"

serpsmith_failed=$(/bin/zsh "$serpsmith_tmp_dir/controlled-attempt.sh" permission_regression 1 expected_nonzero -- /usr/bin/false)
[[ "$serpsmith_failed" == "SERPSMITH_ATTEMPT stage=permission_regression attempt=1 status=failed reason=expected_nonzero command_exit=1" ]] || {
  print -u2 -- "controlled-attempt regression: failing command did not return the expected structured result"
  exit 1
}

serpsmith_passed=$(/bin/zsh "$serpsmith_tmp_dir/controlled-attempt.sh" permission_regression 2 expected_nonzero -- /usr/bin/true)
[[ "$serpsmith_passed" == *"SERPSMITH_ATTEMPT stage=permission_regression attempt=2 status=passed"* ]] || {
  print -u2 -- "controlled-attempt regression: passing command did not return the expected structured result"
  exit 1
}

print -- "SERPSMITH_CONTROLLED_ATTEMPT_REGRESSION passed"
