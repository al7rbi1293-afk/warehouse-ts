#!/usr/bin/env bash
set -euo pipefail

APP_URL="${1:-https://warehouse-ts.vercel.app}"
CUSTOM_DOMAIN="${2:-nstcprojectmanagmentapp.com}"
REPORT_DIR="${REPORT_DIR:-maintenance/reports}"
mkdir -p "$REPORT_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_FILE="$REPORT_DIR/weekly-health-$TS.md"

get_http_metrics() {
  local url="$1"
  curl -sS -o /dev/null -w "HTTP %{http_code} | DNS %{time_namelookup}s | TTFB %{time_starttransfer}s | TOTAL %{time_total}s" "$url"
}

get_cert_expiry_days() {
  local host="$1"
  local end_date
  end_date="$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2 || true)"
  if [[ -z "$end_date" ]]; then
    echo "unavailable"
    return
  fi
  local end_ts now_ts days_left
  end_ts="$(date -j -f "%b %e %T %Y %Z" "$end_date" +%s 2>/dev/null || true)"
  now_ts="$(date +%s)"
  if [[ -z "$end_ts" ]]; then
    echo "unavailable"
    return
  fi
  days_left="$(( (end_ts - now_ts) / 86400 ))"
  echo "$days_left"
}

{
  echo "# Weekly Health Check"
  echo
  echo "- Timestamp (UTC): $(date -u '+%Y-%m-%d %H:%M:%S')"
  echo "- App URL: $APP_URL"
  echo "- Custom Domain: $CUSTOM_DOMAIN"
  echo
  echo "## Endpoint Checks"
  for path in / /login /robots.txt /sitemap.xml; do
    echo "- $APP_URL$path -> $(get_http_metrics "$APP_URL$path")"
  done
  echo
  echo "## DNS"
  echo "- $(echo "$APP_URL" | sed -E 's#https?://##') A: $(dig +short "$(echo "$APP_URL" | sed -E 's#https?://##')" A | tr '\n' ' ')"
  echo "- $CUSTOM_DOMAIN A: $(dig +short "$CUSTOM_DOMAIN" A | tr '\n' ' ')"
  echo
  echo "## SSL"
  echo "- $(echo "$APP_URL" | sed -E 's#https?://##') cert days remaining: $(get_cert_expiry_days "$(echo "$APP_URL" | sed -E 's#https?://##')")"
  echo
  if command -v vercel >/dev/null 2>&1; then
    echo "## Vercel"
    vercel list warehouse-ts --environment=production --status=READY --format=json | jq -r '.deployments[0] | "- Latest deployment: \(.url) | createdAt: \(.createdAt) | ready: \(.ready)"'
  else
    echo "## Vercel"
    echo "- Vercel CLI not available"
  fi
} > "$REPORT_FILE"

echo "Weekly health report written to: $REPORT_FILE"
