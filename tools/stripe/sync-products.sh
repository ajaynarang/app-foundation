#!/usr/bin/env bash
#
# Syncs all Stripe products/prices with the database (local + AWS staging).
#
# What this does:
#   1. Reads product catalog from the local DB (plan_configs + add_ons)
#   2. Creates Stripe products + recurring prices for any missing providerPriceId
#   3. Updates the local DB with the new Stripe price IDs
#   4. Optionally updates the AWS staging DB via SSM tunnel
#
# Usage:
#   ./sync-stripe-products.sh                # Sync to local DB only
#   ./sync-stripe-products.sh --aws          # Sync to local + AWS staging DB
#   ./sync-stripe-products.sh --dry-run      # Show what would be created (no changes)
#   ./sync-stripe-products.sh --force        # Re-create Stripe prices even if already set
#
# Prerequisites:
#   - STRIPE_SECRET_KEY in .env or .env.local (apps/backend/)
#   - DATABASE_URL in .env or .env.local (apps/backend/)
#   - For --aws: AWS CLI configured, db-tunnel.sh available
#
# Tax code: txcd_10000000 = "General - Electronically Supplied Services"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOLS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$TOOLS_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/apps/backend"

# --- Parse arguments ---
SYNC_AWS=false
DRY_RUN=false
FORCE=false
AWS_TUNNEL_PORT="5433"

while [[ $# -gt 0 ]]; do
  case $1 in
    --aws)       SYNC_AWS=true; shift ;;
    --dry-run)   DRY_RUN=true; shift ;;
    --force)     FORCE=true; shift ;;
    --tunnel-port)
      AWS_TUNNEL_PORT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--aws] [--dry-run] [--force] [--tunnel-port PORT]"
      echo ""
      echo "  --aws          Also update AWS staging DB via SSM tunnel"
      echo "  --dry-run      Show what would be created without making changes"
      echo "  --force        Re-create Stripe prices even if providerPriceId is already set"
      echo "  --tunnel-port  Local port for SSM tunnel (default: 5433)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --- Load env (line-by-line to handle values with spaces) ---
cd "$BACKEND_DIR"
load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    key=$(echo "$key" | xargs)
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    export "$key=$value"
  done < "$file"
}
load_env_file .env
load_env_file .env.local

if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
  echo "ERROR: STRIPE_SECRET_KEY not found in .env or .env.local"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL not found in .env or .env.local"
  exit 1
fi

TAX_CODE="txcd_10000000"

# Temp file to collect SQL update statements
SQL_FILE=$(mktemp)
trap "rm -f $SQL_FILE" EXIT

# --- Helper: Create Stripe product + recurring price ---
create_stripe_product() {
  local name="$1"
  local description="$2"
  local amount_cents="$3"
  local interval="${4:-month}"

  local result
  result=$(curl -s https://api.stripe.com/v1/products \
    -u "$STRIPE_SECRET_KEY:" \
    -d "name=$name" \
    -d "description=$description" \
    -d "tax_code=$TAX_CODE" \
    -d "default_price_data[currency]=usd" \
    -d "default_price_data[unit_amount]=$amount_cents" \
    -d "default_price_data[recurring][interval]=$interval")

  local error
  error=$(echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',{}).get('message',''))" 2>/dev/null || echo "")
  if [[ -n "$error" ]]; then
    echo "  ERROR: $error" >&2
    return 1
  fi

  echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin)['default_price'])"
}

# --- Helper: Build AWS tunnel connection string ---
get_aws_tunnel_url() {
  local staging_url
  staging_url=$(aws secretsmanager get-secret-value \
    --secret-id sally-staging-secret-db-url \
    --query 'SecretString' --output text)
  echo "$staging_url" \
    | sed "s|sally-staging-rds-postgres.cb4sy4ym62k1.us-east-1.rds.amazonaws.com:5432|localhost:${AWS_TUNNEL_PORT}|" \
    | sed 's|sslmode=no-verify|sslmode=require|'
}

echo "=============================================="
echo "  SALLY Stripe Product Sync"
echo "=============================================="
echo ""
echo "Mode: $( $DRY_RUN && echo 'DRY RUN' || echo 'LIVE' )"
echo "Force re-create: $( $FORCE && echo 'YES' || echo 'NO' )"
echo "Sync AWS staging: $( $SYNC_AWS && echo 'YES' || echo 'NO' )"
echo ""

# ──────────────────────────────────────────────────────────────────────
# 1. PLAN CONFIGS (plan_configs table)
# ──────────────────────────────────────────────────────────────────────
echo "── Plan Configs ──────────────────────────────"

psql "$DATABASE_URL" -t -A -F '|' -c "
  SELECT plan, display_name, COALESCE(price_per_unit, 0), COALESCE(provider_price_id, '')
  FROM plan_configs
  WHERE is_active = true
  ORDER BY display_order;
" | while IFS='|' read -r plan display_name price_cents existing_price_id; do
  [[ -z "$plan" ]] && continue

  if [[ "$price_cents" == "0" || "$price_cents" == "" ]]; then
    echo "  SKIP $display_name ($plan) — custom pricing, no fixed price"
    continue
  fi

  if [[ -n "$existing_price_id" && "$FORCE" != "true" ]]; then
    echo "  OK   $display_name ($plan) — already has $existing_price_id"
    continue
  fi

  price_display=$(awk "BEGIN{printf \"\\$%.2f\", $price_cents/100}")
  echo -n "  CREATE $display_name ($plan) — ${price_display}/month ... "

  if $DRY_RUN; then
    echo "WOULD CREATE"
    continue
  fi

  price_id=$(create_stripe_product "$display_name ($plan)" "Sally TMS - $display_name plan" "$price_cents")
  echo "$price_id"
  echo "UPDATE plan_configs SET provider_price_id = '${price_id}' WHERE plan = '${plan}';" >> "$SQL_FILE"
done

# ──────────────────────────────────────────────────────────────────────
# 2. ADD-ONS (add_ons table)
# ──────────────────────────────────────────────────────────────────────
echo ""
echo "── Add-Ons ─────────────────────────────────────"

psql "$DATABASE_URL" -t -A -F '|' -c "
  SELECT slug, name, COALESCE(price_cents, 0), COALESCE(billing_interval, 'monthly'), COALESCE(provider_price_id, ''), COALESCE(description, '')
  FROM add_ons
  WHERE is_active = true
  ORDER BY display_order;
" | while IFS='|' read -r slug name price_cents interval existing_price_id description; do
  [[ -z "$slug" ]] && continue

  if [[ "$price_cents" == "0" ]]; then
    echo "  SKIP $name ($slug) — free add-on"
    continue
  fi

  if [[ -n "$existing_price_id" && "$FORCE" != "true" ]]; then
    echo "  OK   $name ($slug) — already has $existing_price_id"
    continue
  fi

  # Normalize interval: "monthly" -> "month"
  stripe_interval="${interval/monthly/month}"
  stripe_interval="${stripe_interval/yearly/year}"

  price_display=$(awk "BEGIN{printf \"\\$%.2f\", $price_cents/100}")
  echo -n "  CREATE $name ($slug) — ${price_display}/${stripe_interval} ... "

  if $DRY_RUN; then
    echo "WOULD CREATE"
    continue
  fi

  price_id=$(create_stripe_product "$name" "$description" "$price_cents" "$stripe_interval")
  echo "$price_id"
  echo "UPDATE add_ons SET provider_price_id = '${price_id}' WHERE slug = '${slug}';" >> "$SQL_FILE"
done

# ──────────────────────────────────────────────────────────────────────
# 3. UPDATE LOCAL DB
# ──────────────────────────────────────────────────────────────────────
if $DRY_RUN; then
  echo ""
  echo "DRY RUN complete — no changes made."
  exit 0
fi

echo ""
echo "── Updating Local DB ─────────────────────────"

if [[ ! -s "$SQL_FILE" ]]; then
  echo "  No updates needed — all products already synced."
else
  echo "  Running $(wc -l < "$SQL_FILE" | xargs) update(s)..."
  cat "$SQL_FILE"
  psql "$DATABASE_URL" -f "$SQL_FILE" > /dev/null
  echo "  Local DB updated."
fi

# ──────────────────────────────────────────────────────────────────────
# 4. UPDATE AWS STAGING DB (optional)
# ──────────────────────────────────────────────────────────────────────
if $SYNC_AWS; then
  echo ""
  echo "── Updating AWS Staging DB ───────────────────"

  if [[ ! -s "$SQL_FILE" ]]; then
    echo "  No updates needed — all products already synced."
  else
    STARTED_TUNNEL=false

    # Check if tunnel is already running
    if ! nc -z localhost "$AWS_TUNNEL_PORT" 2>/dev/null; then
      echo "  Starting SSM tunnel on port $AWS_TUNNEL_PORT..."
      "$TOOLS_DIR/db/tunnel.sh" --local-port "$AWS_TUNNEL_PORT" &
      TUNNEL_PID=$!

      for i in $(seq 1 30); do
        if nc -z localhost "$AWS_TUNNEL_PORT" 2>/dev/null; then break; fi
        sleep 1
      done

      if ! nc -z localhost "$AWS_TUNNEL_PORT" 2>/dev/null; then
        echo "  ERROR: Tunnel failed to start within 30s"
        kill $TUNNEL_PID 2>/dev/null || true
        exit 1
      fi
      echo "  Tunnel established."
      STARTED_TUNNEL=true
    else
      echo "  Tunnel already running on port $AWS_TUNNEL_PORT."
    fi

    TUNNEL_URL=$(get_aws_tunnel_url)
    psql "$TUNNEL_URL" -f "$SQL_FILE" > /dev/null
    echo "  AWS staging DB updated."

    if $STARTED_TUNNEL; then
      kill $TUNNEL_PID 2>/dev/null || true
      echo "  Tunnel closed."
    fi
  fi
fi

# ──────────────────────────────────────────────────────────────────────
# 5. SUMMARY
# ──────────────────────────────────────────────────────────────────────
echo ""
echo "── Summary ───────────────────────────────────"

echo ""
echo "Plans:"
psql "$DATABASE_URL" -c "
  SELECT plan, display_name, COALESCE(price_per_unit, 0) AS price_cents, provider_price_id
  FROM plan_configs ORDER BY display_order;
"

echo "Add-Ons:"
psql "$DATABASE_URL" -c "
  SELECT slug, name, COALESCE(price_cents, 0) AS price_cents, provider_price_id
  FROM add_ons ORDER BY display_order;
"

echo ""
echo "Done."
