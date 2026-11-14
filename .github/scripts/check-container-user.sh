#!/usr/bin/env bash
# The slow half of the container checks (the fast, static half is check-dockerfiles.sh, in `pnpm check:ops`).
#
#   check-container-user.sh [image-tag]   needs Docker running; builds from the repo root
#
# Builds apps/backend/Dockerfile exactly as the deploy does, with the frozen install (so a dropped `COPY patches/` line
# fails the build), then runs the image and asserts the process is not root (`id -u` is not 0) and can write nothing
# into /app it does not own. Not in check:ops or the pre-push hook: a full image build takes minutes. Run it by hand
# with Docker up, or from the manual workflow .github/workflows/container.yml.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
tag="${1:-app-backend-container-check:local}"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "check-container-user: Docker is not running; start it and run again"
  exit 2
fi

echo "check-container-user: building apps/backend/Dockerfile as ${tag}"
docker build --file "$root/apps/backend/Dockerfile" --tag "$tag" "$root"

# Override the entrypoint command: the image's CMD needs a Doppler token, and only the user matters here.
uid=$(docker run --rm --entrypoint id "$tag" -u)
user=$(docker run --rm --entrypoint id "$tag" -un)
if [ "$uid" = "0" ]; then
  echo "check-container-user: FAIL, the container runs as root (uid 0)"
  exit 1
fi

# The app files are the runtime user's; the tree must be readable by it (a wrong --chown would show here).
if ! docker run --rm --entrypoint sh "$tag" -c 'test -r /app/dist/main.js && test -r /app/package.json && test -O /app/dist'; then
  echo "check-container-user: FAIL, /app is not readable and owned by ${user}"
  exit 1
fi

echo "check-container-user: ok (runs as ${user}, uid ${uid})"
