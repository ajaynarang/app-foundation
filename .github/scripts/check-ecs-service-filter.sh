#!/usr/bin/env bash
# Every `aws ecs list-tasks` call names its service (`--service-name`). The migration jobs and tools/db/ pick a jump
# host for the SSM tunnel from that list; without the filter they take the first running task of any service, which
# is the worker half the time, and the worker's ECS Exec is off. The API service is the only jump host.
#
#   check-ecs-service-filter.sh [file...]   defaults to the deploy workflow and the tools/db scripts
#
# A shell command continued with a trailing backslash counts as one call; a comment line is not a call. Tested by check-ecs-service-filter.test.sh;
# both run in `pnpm check:ops` and the deploy workflow's validate job.
set -uo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
if [ "$#" -eq 0 ]; then
  set -- "$root/.github/workflows/deploy-all.yml" "$root"/tools/db/*.sh "$root"/tools/db/lib/*.sh
fi

bad=0
for file in "$@"; do
  [ -f "$file" ] || {
    echo "check-ecs-service-filter: no such file: $file"
    bad=1
    continue
  }
  # Join continued lines, then report each logical line that calls list-tasks without --service-name.
  out=$(awk '
    buf == "" && /^[[:space:]]*#/ { next }
    { line = $0 }
    buf != "" { line = buf " " line; buf = "" }
    /\\[[:space:]]*$/ { sub(/\\[[:space:]]*$/, "", line); buf = line; if (start == 0) start = NR; next }
    {
      first = (start == 0 ? NR : start); start = 0
      if (line ~ /aws[[:space:]]+ecs[[:space:]]+list-tasks/ && line !~ /--service-name/) print FILENAME ":" first ": " line
    }
  ' "$file")
  if [ -n "$out" ]; then
    echo "$out"
    bad=1
  fi
done

if [ "$bad" -ne 0 ]; then
  echo "check-ecs-service-filter: an \`aws ecs list-tasks\` call has no --service-name (or a file is missing)."
  echo "Name the API service (<project>-<env>-ecs-service-api): it is the only jump host."
  exit 1
fi
echo "check-ecs-service-filter: every aws ecs list-tasks call names its service"
