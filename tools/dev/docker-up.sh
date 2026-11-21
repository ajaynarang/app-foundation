#!/usr/bin/env bash
#
# Start Docker if it is not running, then the docker compose services.
# Works on a Mac (Docker Desktop must be open) and in a Linux cloud session
# (Claude Code on the web), where it starts the Docker daemon itself.
#
# Usage, from anywhere in the repo:
#   tools/dev/docker-up.sh                  # every default service
#   tools/dev/docker-up.sh postgres redis   # only these
#
# A service whose image is not on this machine and cannot be pulled is skipped
# with a warning instead of failing everything. MinIO is the known case: its
# images left Docker Hub, so a Mac with a cached copy starts it and a fresh
# cloud machine does not.

set -euo pipefail
cd "$(dirname "$0")/../.."

if ! docker info >/dev/null 2>&1; then
  if [ "$(uname)" = "Linux" ] && [ "$(id -u)" = "0" ] && command -v dockerd >/dev/null 2>&1; then
    # A daemon still shutting down holds its pid file; let it finish first.
    for _ in $(seq 1 30); do pgrep -x dockerd >/dev/null || break; sleep 1; done
    (dockerd >/var/log/dockerd.log 2>&1 &)
    for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running. On a Mac, open Docker Desktop and try again." >&2
    exit 1
  fi
fi

# (A read loop, not mapfile: macOS still ships bash 3.2.)
services=("$@")
if [ "$#" -eq 0 ]; then
  while IFS= read -r service; do services+=("$service"); done < <(docker compose config --services)
fi

ok=()
for service in "${services[@]}"; do
  for attempt in 1 2 3 4 5; do
    if out="$(docker compose create --pull missing "$service" 2>&1)"; then
      ok+=("$service")
      break
    fi
    # Docker Hub rate-limits anonymous pulls from shared addresses (cloud
    # machines): a 429 now often goes through a little later.
    if [ "$attempt" -lt 5 ] && printf '%s' "$out" | grep -qiE 'toomanyrequests|429|rate limit'; then
      sleep $((attempt * 10))
      continue
    fi
    echo "Skipped $service: its image is not here and could not be pulled." >&2
    break
  done
done

if [ "${#ok[@]}" -gt 0 ]; then
  docker compose up -d "${ok[@]}"
fi
