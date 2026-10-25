#!/bin/sh
# DAST baseline (S4): scripted ZAP baseline scan against a local build.
# Requires: a running app on $BASE_URL (default http://localhost:3000)
# and the `zap-baseline.py` script from OWASP ZAP (docker image
# ghcr.io/zaproxy/zaproxy:stable). Saves the report to docs/security/.
# This script is NOT run in CI here (no ZAP binary in this environment);
# run it manually before release and commit the report.
set -eu
BASE_URL="${BASE_URL:-http://localhost:3000}"
OUT="docs/security/zap-baseline-report.html"
mkdir -p docs/security
if ! command -v zap-baseline.py >/dev/null 2>&1 && ! command -v docker >/dev/null 2>&1; then
  echo "ZAP not available (need zap-baseline.py or docker). Skipping — see docs/security/README."
  exit 2
fi
if command -v zap-baseline.py >/dev/null 2>&1; then
  zap-baseline.py -t "$BASE_URL" -r zap-baseline-report.html -J zap-baseline-report.json || true
  mv -f zap-baseline-report.html "$OUT" 2>/dev/null || true
else
  docker run --rm -v "$(pwd)/docs/security:/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable \
    zap-baseline.py -t "$BASE_URL" -r zap-baseline-report.html || true
fi
echo "Report (if generated): $OUT"
