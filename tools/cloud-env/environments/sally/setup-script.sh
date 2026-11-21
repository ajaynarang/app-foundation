#!/usr/bin/env bash
# Cloud environment setup script for sally (app-shore/sally).
#
# Paste into the environment's "Setup script" box. Same shape as
# ../../setup-script.sh, plus the RLS app role login: the password below is
# the throwaway one sally's rls-gate CI job uses for a database that lives only
# on this machine. It is not a secret.
set -euo pipefail

if [ -d sally ]; then
  cd sally
  if [ -x tools/dev/docker-up.sh ]; then
    SALLY_APP_DB_PASSWORD=ciRlsGateThrowawayAppRolePassword0001 tools/dev/install.sh
    docker compose stop
    pkill -x dockerd || true
    while pgrep -x dockerd >/dev/null; do sleep 1; done
  else
    echo "Cloud setup skipped: this checkout has no tools/dev/docker-up.sh yet."
  fi
fi
