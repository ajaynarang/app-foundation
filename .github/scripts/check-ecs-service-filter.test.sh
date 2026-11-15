#!/usr/bin/env bash
# Hermetic test of check-ecs-service-filter.sh on throwaway files, then on this repo's deploy workflow and tools/db.
# Run by `pnpm check:ops` and the deploy workflow's validate job.
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/check-ecs-service-filter.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fails=0

expect() { # <want: pass|fail> <name> [file...]
  local want=$1 name=$2 got=fail
  shift 2
  if bash "$SCRIPT" "$@" >/dev/null 2>&1; then got=pass; fi
  if [ "$got" = "$want" ]; then echo "ok   $name"; else
    echo "FAIL $name (wanted $want, got $got)"
    fails=$((fails + 1))
  fi
}

cat >"$work/filtered.yml" <<'EOF'
        run: |
          TASK_ARNS=$(aws ecs list-tasks \
            --cluster "$CLUSTER" \
            --service-name "app-staging-ecs-service-api" \
            --desired-status RUNNING \
            --query 'taskArns[0]' \
            --output text)
EOF
cat >"$work/unfiltered.yml" <<'EOF'
        run: |
          TASK_ARNS=$(aws ecs list-tasks \
            --cluster "$CLUSTER" \
            --desired-status RUNNING \
            --query 'taskArns[0]' \
            --output text)
EOF
cat >"$work/one-line.sh" <<'EOF'
arns=$(aws ecs list-tasks --cluster "$CLUSTER" --desired-status RUNNING)
EOF
cat >"$work/filter-on-next-call.sh" <<'EOF'
arns=$(aws ecs list-tasks --cluster "$CLUSTER")
aws ecs describe-services --cluster "$CLUSTER" --services api   # --service-name on another command does not count
EOF
cat >"$work/comment.yml" <<'EOF'
      # Every `aws ecs list-tasks` call names the API service.
EOF
cat >"$work/no-call.sh" <<'EOF'
aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$arn"
EOF

expect pass "a continued call with --service-name" "$work/filtered.yml"
expect fail "a continued call without it" "$work/unfiltered.yml"
expect fail "a one-line call without it" "$work/one-line.sh"
expect fail "a filter on the next command does not count" "$work/filter-on-next-call.sh"
expect pass "a file with no list-tasks call" "$work/no-call.sh"
expect pass "a comment that mentions the call is not a call" "$work/comment.yml"
expect fail "one bad file among good ones fails" "$work/filtered.yml" "$work/unfiltered.yml"
expect fail "a missing file fails" "$work/nope.yml"
expect pass "this repo: deploy-all.yml and tools/db"

[ "$fails" -eq 0 ] || exit 1
