#!/usr/bin/env bash
set -euo pipefail

REPORT_DIR="${REPORT_DIR:-maintenance/reports}"
mkdir -p "$REPORT_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

AUDIT_FILE="$REPORT_DIR/security-audit-$TS.json"
OUTDATED_FILE="$REPORT_DIR/security-outdated-$TS.json"
SECRETS_FILE="$REPORT_DIR/security-secrets-$TS.txt"
SUMMARY_FILE="$REPORT_DIR/security-summary-$TS.md"

npm audit --json > "$AUDIT_FILE" || true
npm outdated --json > "$OUTDATED_FILE" || true

git ls-files | while IFS= read -r file; do
  if [[ -f "$file" ]]; then
    rg -n --no-heading \
      "(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\\-_]{35}|xox[baprs]-[0-9A-Za-z-]{10,}|ghp_[0-9A-Za-z]{36}|postgresql://[^\\s]+:[^\\s]+@|NEXTAUTH_SECRET\\s*=|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)" \
      "$file" || true
  fi
done > "$SECRETS_FILE"

{
  echo "# Security Scan Summary"
  echo
  echo "- Timestamp (UTC): $(date -u '+%Y-%m-%d %H:%M:%S')"
  echo "- Audit file: $AUDIT_FILE"
  echo "- Outdated file: $OUTDATED_FILE"
  echo "- Secret scan file: $SECRETS_FILE"
  echo
  if [[ -s "$AUDIT_FILE" ]]; then
    echo "## Vulnerabilities"
    jq -r '.metadata.vulnerabilities | to_entries[] | "- \(.key): \(.value)"' "$AUDIT_FILE"
  fi
  echo
  if [[ -s "$OUTDATED_FILE" ]]; then
    echo "## Outdated Packages"
    jq -r 'to_entries[] | "- \(.key): current=\(.value.current) latest=\(.value.latest)"' "$OUTDATED_FILE"
  fi
  echo
  if [[ -s "$SECRETS_FILE" ]]; then
    echo "## Potential Secrets"
    sed -n '1,80p' "$SECRETS_FILE"
  else
    echo "## Potential Secrets"
    echo "- none found"
  fi
} > "$SUMMARY_FILE"

echo "Security summary written to: $SUMMARY_FILE"
