#!/usr/bin/env bash
# sally-dev.sh — run backend + web + console side-by-side with custom ports.
#
# Opens iTerm2 with 3 tabs (backend / web / console), each running its
# app under Doppler. Env vars are auto-wired so the frontends call the
# right backend and CORS allows the chosen frontend ports.
#
# Usage:
#   tools/dev/sally-dev.sh                          # defaults: 8001 / 3001 / 3002
#   tools/dev/sally-dev.sh --offset 3               # shifts all three by +3
#   tools/dev/sally-dev.sh --backend 8004 --web 3010 --console 3012
#   tools/dev/sally-dev.sh --backend 8004 --web 3010 --no-console
#   tools/dev/sally-dev.sh --stop                   # kill whatever is on default ports
#   tools/dev/sally-dev.sh --stop --backend 8004 --web 3010 --console 3012
#
# Flags:
#   --backend <port>   backend port (default 8001)
#   --web <port>       web port (default 3001)
#   --console <port>   console port (default 3002)
#   --offset <n>       shift defaults by n
#   --no-backend       skip backend
#   --no-web           skip web
#   --no-console       skip console
#   --stop             kill processes listening on the specified ports and exit
#   -h, --help         show this help

set -euo pipefail

# ---- defaults ----
BACKEND_PORT=8001
WEB_PORT=3001
CONSOLE_PORT=3002
RUN_BACKEND=1
RUN_WEB=1
RUN_CONSOLE=1
OFFSET=0
STOP_MODE=0

# ---- colors ----
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'
  C_BLU=$'\033[34m'; C_MAG=$'\033[35m'; C_RED=$'\033[31m'; C_RST=$'\033[0m'
else
  C_BOLD=''; C_DIM=''; C_GRN=''; C_YLW=''; C_BLU=''; C_MAG=''; C_RED=''; C_RST=''
fi

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//' | sed 's/^#$//'
  exit 0
}

# ---- parse args ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend)    BACKEND_PORT="$2"; shift 2 ;;
    --web)        WEB_PORT="$2"; shift 2 ;;
    --console)    CONSOLE_PORT="$2"; shift 2 ;;
    --offset)     OFFSET="$2"; shift 2 ;;
    --no-backend) RUN_BACKEND=0; shift ;;
    --no-web)     RUN_WEB=0; shift ;;
    --no-console) RUN_CONSOLE=0; shift ;;
    --stop)       STOP_MODE=1; shift ;;
    -h|--help)    usage ;;
    *)            echo "${C_RED}Unknown flag: $1${C_RST}"; usage ;;
  esac
done

if [[ "$OFFSET" != "0" ]]; then
  BACKEND_PORT=$((BACKEND_PORT + OFFSET))
  WEB_PORT=$((WEB_PORT + OFFSET))
  CONSOLE_PORT=$((CONSOLE_PORT + OFFSET))
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# Branch name for tab titles + banners. Falls back to "(no-git)" if not in a repo.
GIT_BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(no-git)")

# ---- --stop mode ----
if [[ $STOP_MODE -eq 1 ]]; then
  echo "${C_BOLD}Sally dev — stopping${C_RST}"
  kill_port() {
    local port="$1"; local label="$2"
    local pids
    pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -n -P -t 2>/dev/null || true)
    if [[ -z "$pids" ]]; then
      echo "  ${C_DIM}${label} (:${port}) — nothing listening${C_RST}"
      return
    fi
    echo "  ${C_YLW}${label} (:${port}) — killing pids: ${pids}${C_RST}"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.3
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  }
  [[ $RUN_BACKEND -eq 1 ]] && kill_port "$BACKEND_PORT" backend
  [[ $RUN_WEB     -eq 1 ]] && kill_port "$WEB_PORT"     web
  [[ $RUN_CONSOLE -eq 1 ]] && kill_port "$CONSOLE_PORT" console
  exit 0
fi

# ---- pre-flight ----
if ! command -v doppler >/dev/null 2>&1; then
  echo "${C_RED}doppler CLI not found. Install: https://docs.doppler.com/docs/install-cli${C_RST}"
  exit 1
fi

if ! [[ -d "/Applications/iTerm.app" ]]; then
  echo "${C_RED}iTerm2 not found at /Applications/iTerm.app.${C_RST}"
  echo "${C_YLW}Install it or swap the spawn function for Terminal.app.${C_RST}"
  exit 1
fi

check_port() {
  local port="$1"; local label="$2"
  if lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    echo "${C_RED}Port $port (${label}) is already in use.${C_RST}"
    lsof -iTCP:"$port" -sTCP:LISTEN -n -P | tail -n +2 | head -3 | sed "s/^/  ${C_DIM}/;s/$/${C_RST}/"
    echo "${C_YLW}Hint: ${0##*/} --stop --${label} ${port}${C_RST}"
    return 1
  fi
}

any_err=0
[[ $RUN_BACKEND -eq 1 ]] && { check_port "$BACKEND_PORT" backend || any_err=1; }
[[ $RUN_WEB     -eq 1 ]] && { check_port "$WEB_PORT"     web     || any_err=1; }
[[ $RUN_CONSOLE -eq 1 ]] && { check_port "$CONSOLE_PORT" console || any_err=1; }
[[ $any_err -ne 0 ]] && exit 1

API_URL="http://localhost:${BACKEND_PORT}/api/v1"

# Exact CORS origins for this run (option B — explicit allowlist).
cors_parts=()
[[ $RUN_WEB     -eq 1 ]] && cors_parts+=("http://localhost:${WEB_PORT}")
[[ $RUN_CONSOLE -eq 1 ]] && cors_parts+=("http://localhost:${CONSOLE_PORT}")
CORS_ORIGINS_VALUE=$(IFS=, ; echo "${cors_parts[*]}")

# ---- banner ----
echo
echo "${C_BOLD}Sally dev — side-by-side stack${C_RST}"
echo "${C_DIM}─────────────────────────────────${C_RST}"
[[ $RUN_BACKEND -eq 1 ]] && echo "  ${C_BLU}backend${C_RST}  http://localhost:${C_BOLD}${BACKEND_PORT}${C_RST}"
[[ $RUN_WEB     -eq 1 ]] && echo "  ${C_GRN}web    ${C_RST}  http://localhost:${C_BOLD}${WEB_PORT}${C_RST}"
[[ $RUN_CONSOLE -eq 1 ]] && echo "  ${C_MAG}console${C_RST}  http://localhost:${C_BOLD}${CONSOLE_PORT}${C_RST}"
echo "${C_DIM}  API URL for frontends: ${API_URL}${C_RST}"
echo "${C_DIM}  CORS origins:          ${CORS_ORIGINS_VALUE:-<none>}${C_RST}"
echo "${C_DIM}─────────────────────────────────${C_RST}"
echo "${C_DIM}Opening iTerm2 tabs…${C_RST}"
echo

# ---- iTerm2 spawn helpers ----
# We open one new iTerm window for the first service, then open additional
# tabs in that same window for the remaining services. Each tab's title is
# set so you can tell them apart at a glance.
#
# The tab runs a single shell command that:
#   1) cds to the app directory
#   2) exec's `env ... doppler run -- <cmd>`
# `exec` replaces the shell, so when you Ctrl+C the app the tab closes.

FIRST_TAB_OPENED=0

# Temp dir for per-tab bootstrap scripts. NOT trap-cleaned — the iTerm
# tabs launch asynchronously, so we'd race them. /tmp is cleaned by macOS.
TAB_SCRIPT_DIR=$(mktemp -d -t sally-dev-XXXXXX)

TAB_COUNTER=0

open_tab() {
  local title="$1"; local dir="$2"; local cmd="$3"; local banner="$4"

  # Write a tiny bootstrap script that each tab will execute. Avoids the
  # nightmare of escaping quotes/backslashes through AppleScript's `write text`.
  TAB_COUNTER=$((TAB_COUNTER + 1))
  local tab_script="${TAB_SCRIPT_DIR}/tab-${TAB_COUNTER}.sh"
  cat > "$tab_script" <<SCRIPT
#!/usr/bin/env bash
cd "${dir}"
clear
# Set tab title (OSC 0).
printf '\033]0;%s\007' "${title}"
# Per-tab banner.
printf '%b\n\n' "${banner}"
# Replace shell with the app command so Ctrl+C kills the app (not a wrapper shell).
exec ${cmd}
SCRIPT
  chmod +x "$tab_script"

  if [[ $FIRST_TAB_OPENED -eq 0 ]]; then
    /usr/bin/osascript \
      -e 'tell application "iTerm"' \
      -e '  activate' \
      -e '  set newWindow to (create window with default profile)' \
      -e '  tell current session of newWindow' \
      -e "    set name to \"${title}\"" \
      -e "    write text \"bash '${tab_script}'\"" \
      -e '  end tell' \
      -e 'end tell' >/dev/null
    FIRST_TAB_OPENED=1
  else
    /usr/bin/osascript \
      -e 'tell application "iTerm"' \
      -e '  tell current window' \
      -e '    set newTab to (create tab with default profile)' \
      -e '    tell current session of newTab' \
      -e "      set name to \"${title}\"" \
      -e "      write text \"bash '${tab_script}'\"" \
      -e '    end tell' \
      -e '  end tell' \
      -e 'end tell' >/dev/null
  fi
}

# Build a per-tab banner (printed inside the tab before the app starts).
# ANSI color codes are embedded directly because the banner is echo'd via printf.
make_banner() {
  local app="$1"; local port="$2"; local color="$3"
  printf '%b' \
    "${color}▸ ${app}${C_RST} ${C_DIM}│${C_RST} port ${C_BOLD}:${port}${C_RST} ${C_DIM}│${C_RST} branch ${C_BOLD}${GIT_BRANCH}${C_RST} ${C_DIM}│${C_RST} ${C_DIM}${REPO_ROOT}${C_RST}"
}

# ---- spawn ----
# IMPORTANT: `doppler run` INJECTS secrets from the Doppler config, which by
# default OVERWRITES any existing env vars with the same name. Doppler's dev
# configs pin PORT (backend=8001, web=3001) and NEXT_PUBLIC_API_URL, so we
# must use `--preserve-env=PORT,NEXT_PUBLIC_API_URL,CORS_ORIGINS` to tell
# Doppler: "if these are already set in the calling env, keep them."
# Without this, our offset/override ports get silently clobbered.

DOPPLER_PRESERVE="--preserve-env=PORT,NEXT_PUBLIC_API_URL,CORS_ORIGINS"

# Backend reads process.env.PORT (apps/backend/src/main.ts:209).
if [[ $RUN_BACKEND -eq 1 ]]; then
  open_tab "backend :${BACKEND_PORT} [${GIT_BRANCH}]" "$REPO_ROOT/apps/backend" \
    "env PORT=${BACKEND_PORT} CORS_ORIGINS='${CORS_ORIGINS_VALUE}' doppler run ${DOPPLER_PRESERVE} -- pnpm run dev" \
    "$(make_banner 'sally-backend' "$BACKEND_PORT" "$C_BLU")"
fi

# Web: NEXT_PUBLIC_API_URL is the single source of truth for all frontend modules.
if [[ $RUN_WEB -eq 1 ]]; then
  open_tab "web :${WEB_PORT} [${GIT_BRANCH}]" "$REPO_ROOT/apps/web" \
    "env PORT=${WEB_PORT} NEXT_PUBLIC_API_URL='${API_URL}' doppler run ${DOPPLER_PRESERVE} -- pnpm run dev" \
    "$(make_banner 'sally-web    ' "$WEB_PORT" "$C_GRN")"
fi

# Console: its package.json dev script hardcodes `-p 3002`, so we bypass it.
if [[ $RUN_CONSOLE -eq 1 ]]; then
  open_tab "console :${CONSOLE_PORT} [${GIT_BRANCH}]" "$REPO_ROOT/apps/console" \
    "env NEXT_PUBLIC_API_URL='${API_URL}' doppler run ${DOPPLER_PRESERVE} -- pnpm exec next dev -p ${CONSOLE_PORT}" \
    "$(make_banner 'sally-console' "$CONSOLE_PORT" "$C_MAG")"
fi

echo "${C_GRN}Done.${C_RST} Tabs opened in iTerm2."
echo "${C_DIM}Stop everything later with:${C_RST}"
echo "  ${C_BOLD}./tools/dev/sally-dev.sh --stop --backend ${BACKEND_PORT} --web ${WEB_PORT} --console ${CONSOLE_PORT}${C_RST}"
