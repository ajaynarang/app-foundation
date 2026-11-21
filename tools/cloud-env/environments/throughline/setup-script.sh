#!/usr/bin/env bash
# Cloud environment setup script for throughline (copy of ../../setup-script.sh).
#
# Paste this into the environment's "Setup script" box (claude.ai, cloud
# environment settings) and set REPO to the repository's name. It runs as root
# on a fresh Ubuntu machine, in the folder that holds the checkouts, before
# Claude starts. It cannot read the environment's variables or secrets.
#
# All the real work is the repo's own tools/dev/install.sh, the same script a
# Mac runs. Docker is stopped at the end; the images and the migrated database
# stay on this machine's disk, and tools/dev/docker-up.sh starts them again in
# the session in about 15 seconds.
set -euo pipefail
REPO=throughline

if [ -d "$REPO" ]; then
  cd "$REPO"
  if [ -x tools/dev/docker-up.sh ]; then
    tools/dev/install.sh
    docker compose stop
    pkill -x dockerd || true
    while pgrep -x dockerd >/dev/null; do sleep 1; done
  else
    echo "Cloud setup skipped: this checkout has no tools/dev/docker-up.sh yet."
  fi
fi
