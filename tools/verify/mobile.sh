#!/usr/bin/env bash
# pnpm verify:mobile — the Flutter gate: `flutter analyze` and `flutter test` in apps/mobile.
#
# A step of `pnpm verify` and of every `pnpm verify:scaffold` variant. A product scaffolded with `--mobile no` has
# no apps/mobile, and the step passes without running anything. A product that keeps the app needs Flutter on PATH:
# a missing Flutter fails the gate, it never skips it.
set -uo pipefail

cd "$(dirname "$0")/../.."

if [ ! -d apps/mobile ]; then
  echo "verify:mobile: no apps/mobile in this product, nothing to check."
  exit 0
fi
if ! command -v flutter >/dev/null 2>&1; then
  echo "verify:mobile: apps/mobile exists but flutter is not on PATH." >&2
  echo "Install Flutter (https://docs.flutter.dev/get-started/install), or drop the app:" >&2
  echo "  node tools/init-app/apply-feature.mjs --remove mobile" >&2
  exit 1
fi

cd apps/mobile
flutter analyze && flutter test
