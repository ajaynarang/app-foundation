#!/usr/bin/env bash
# Who may deploy production. Run by the deploy workflow's validate job before anything is built.
#
#   DEPLOY_ENV            staging | production (the workflow's environment input)
#   ACTOR                 the GitHub login that started the run (github.actor)
#   PRODUCTION_DEPLOYERS  the repo variable: comma-separated GitHub logins allowed to deploy production
#
# Staging passes. Production passes only when ACTOR is on the list, compared exactly after trimming spaces. An unset
# or empty list locks production: every production deploy fails until someone sets it (Settings → Secrets and
# variables → Actions → Variables). This holds on any GitHub plan; required reviewers on the production environment,
# where the plan offers them, are a second gate on top.
#
# Tested by check-production-deployer.test.sh (pnpm check:ops, and the validate job).
set -uo pipefail

env_name="${DEPLOY_ENV:-}"
actor="${ACTOR:-}"
deployers="${PRODUCTION_DEPLOYERS:-}"

case "$env_name" in
  staging)
    echo "✓ staging: no deployer list"
    exit 0
    ;;
  production) ;;
  *)
    echo "::error::Unknown environment '${env_name}' (expected staging or production)."
    exit 1
    ;;
esac

if [ -z "$(printf '%s' "$deployers" | tr -d '[:space:],')" ]; then
  echo "::error::Production deploys are locked: the PRODUCTION_DEPLOYERS repo variable is not set. Set it (Settings → Secrets and variables → Actions → Variables) to a comma-separated list of GitHub logins allowed to deploy production."
  exit 1
fi
if [ -z "$actor" ]; then
  echo "::error::No actor given; cannot check PRODUCTION_DEPLOYERS."
  exit 1
fi

IFS=',' read -ra logins <<<"$deployers"
for login in "${logins[@]}"; do
  login="$(printf '%s' "$login" | tr -d '[:space:]')"
  if [ -n "$login" ] && [ "$login" = "$actor" ]; then
    echo "✓ ${actor} is an allowed production deployer"
    exit 0
  fi
done

echo "::error::'${actor}' is not in PRODUCTION_DEPLOYERS and cannot deploy production."
exit 1
