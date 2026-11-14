#!/usr/bin/env bash
# Hermetic test of maintenance-mode.sh: the AWS CLI is stubbed with a folder that stands in for S3, so nothing leaves
# the machine. Run by `pnpm check:ops`. Needs jq, as the script does.
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/maintenance-mode.sh"
if ! command -v jq >/dev/null 2>&1; then
  echo "skip: jq is not installed (maintenance-mode.sh needs it)"
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fails=0
bin="$work/bin"
mkdir -p "$bin" "$work/s3"
export S3_ROOT="$work/s3" CALLS="$work/calls.log"

# aws s3 cp s3://bucket/key -   reads  $S3_ROOT/bucket/key (exit 1 when absent)
# aws s3 cp - s3://bucket/key   writes $S3_ROOT/bucket/key from stdin
cat >"$bin/aws" <<'EOF'
#!/usr/bin/env bash
echo "aws $*" >>"$CALLS"
if [ "$1 $2" = "s3 cp" ]; then
  if [ "$3" = "-" ]; then
    dest="${4#s3://}"; mkdir -p "$S3_ROOT/$(dirname "$dest")"; cat >"$S3_ROOT/$dest"; exit 0
  fi
  src="${3#s3://}"; [ -f "$S3_ROOT/$src" ] || exit 1; cat "$S3_ROOT/$src"; exit 0
fi
if [ "$1 $2" = "cloudfront list-distributions" ]; then echo "EDIST123"; exit 0; fi
exit 0
EOF
chmod +x "$bin/aws"
export PATH="$bin:$PATH"
unset CONFIRM_ENV PROJECT

ok() { echo "ok   $1"; }
fail() {
  echo "FAIL $1"
  fails=$((fails + 1))
}
check() {
  local name=$1
  shift
  if "$@"; then ok "$name"; else fail "$name"; fi
}
run() { : >"$CALLS"; bash "$SCRIPT" "$@" </dev/null >"$work/out.log" 2>&1; }
doc() { cat "$S3_ROOT/$1/status/maintenance.json"; }
jqdoc() { doc "$1" | jq -e "$2" >/dev/null 2>&1; }

STG=app-staging-cdn
PRD=app-production-cdn

# --- on / off on staging ---
run on "Database migration" 2h
check "on: runs on staging (the default)" test $? -eq 0
check "on: writes enabled, reason, message, estimate and start" \
  jqdoc "$STG" '.enabled == true and .reason == "Database migration" and (.message | startswith("Database migration")) and (.estimatedEndTime | test("^[0-9]{4}-")) and (.startedAt | test("Z$"))'
check "on: the document is served with a 30s cache" grep -q -- "--cache-control public, max-age=30" "$CALLS"
check "on: the CDN path is invalidated" grep -q -- "create-invalidation --distribution-id EDIST123 --paths /status/\*" "$CALLS"

# A key the script does not own (for example a product's own version gate) survives both writes.
doc "$STG" | jq '. + {apps: {ios: {minSupported: "1.2.3"}}}' >"$work/with-apps.json"
cp "$work/with-apps.json" "$S3_ROOT/$STG/status/maintenance.json"
run off
check "off: runs" test $? -eq 0
check "off: enabled false and its own keys removed" \
  jqdoc "$STG" '.enabled == false and (has("reason") | not) and (has("message") | not) and (has("estimatedEndTime") | not)'
check "off: read-modify-write keeps keys it does not own" jqdoc "$STG" '.apps.ios.minSupported == "1.2.3"'
run on
check "on: read-modify-write keeps keys it does not own" jqdoc "$STG" '.enabled == true and .apps.ios.minSupported == "1.2.3"'

# --- a missing or broken document ---
rm -rf "${S3_ROOT:?}/$STG"
run on
check "on with no document yet: starts from an empty object" jqdoc "$STG" '.enabled == true and .reason == "Scheduled maintenance"'
printf 'not json' >"$S3_ROOT/$STG/status/maintenance.json"
run off
check "off over a broken document: writes a valid one" jqdoc "$STG" '.enabled == false'

# --- bad input ---
run on "x" 2days
check "a bad duration is refused" test $? -ne 0
check "a bad duration writes nothing" bash -c "! grep -q 's3 cp - ' '$CALLS'"
ENV=prod run on
check "an unknown ENV is refused" test $? -ne 0
run frobnicate
check "an unknown action is refused" test $? -ne 0

# --- production ---
ENV=production run on
check "production with no terminal and no CONFIRM_ENV: refused" test $? -ne 0
check "refused production wrote nothing" test ! -e "$S3_ROOT/$PRD/status/maintenance.json"
ENV=production CONFIRM_ENV=production run on "Upgrade" 30m
check "production with CONFIRM_ENV=production: writes" jqdoc "$PRD" '.enabled == true and .reason == "Upgrade"'
check "production writes go to the production bucket only" grep -q "s3://${PRD}/status/maintenance.json" "$CALLS"
check "typed confirmation path: 'production' confirms" bash -c "
  sed 's/^is_interactive() { \[ -t 0 \]; }$/is_interactive() { true; }/' '$SCRIPT' >'$work/tty.sh'
  echo production | ENV=production bash '$work/tty.sh' off >/dev/null 2>&1"
check "typed confirmation path: anything else aborts" bash -c "
  ! (echo yes | ENV=production CONFIRM_ENV=production bash '$work/tty.sh' off >/dev/null 2>&1)"

# --- status and PROJECT ---
run status
check "status runs" test $? -eq 0
check "status reads without writing" bash -c "! grep -q 's3 cp - ' '$CALLS'"
PROJECT=acme run on
check "PROJECT names the bucket" test -f "$S3_ROOT/acme-staging-cdn/status/maintenance.json"

[ "$fails" -eq 0 ] || exit 1
