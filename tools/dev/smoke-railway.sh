#!/usr/bin/env bash
set -euo pipefail

RUN_ID="run-railway-$(date +%s)"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require curl

WORKER_URL="${WORKER_URL:-${RAILWAY_WORKER_URL:-https://worker-playwright-production-6cff.up.railway.app}}"
TELEMETRY_URL="${TELEMETRY_URL:-${RAILWAY_TELEMETRY_URL:-https://telemetryd-production.up.railway.app}}"
TARGET_URL="${TARGET_URL:-${RAILWAY_TARGET_URL:-https://fixture-web-production.up.railway.app}}"

if [[ -z "${WORKER_URL}" || -z "${TELEMETRY_URL}" || -z "${TARGET_URL}" ]]; then
  echo "Set WORKER_URL, TELEMETRY_URL, TARGET_URL (or RAILWAY_* equivalents) before running." >&2
  exit 1
fi

check_health() {
  local url="$1"
  echo "Checking ${url}..."
  if ! curl -sSf "$url" >/dev/null; then
    echo "Health check failed for ${url}" >&2
    exit 1
  fi
}

check_health "${TARGET_URL}/"
check_health "${WORKER_URL}/health"
check_health "${TELEMETRY_URL}/health"

payload=$(cat <<EOF
{
  "run_id": "${RUN_ID}",
  "level_id": "level-1",
  "checkpoint": { "url": "${TARGET_URL}/level/1" },
  "plan": {
    "actions": [
      {
        "id": "click-right",
        "type": "click",
        "target": { "selector": { "strategy": "test_id", "value": "right" } }
      }
    ]
  },
  "time_budget_ms": 10000,
  "artifact_profile": "trainer",
  "telemetry_endpoint": "${TELEMETRY_URL}"
}
EOF
)

echo "Running episode ${RUN_ID}..."
response="$(curl -sSf "${WORKER_URL}/episode/run" \
  -H "content-type: application/json" \
  -d "${payload}")"

if command -v jq >/dev/null 2>&1; then
  echo "${response}" | jq
else
  echo "${response}"
fi

echo "Fetching run summary..."
summary="$(curl -sSf "${TELEMETRY_URL}/runs/${RUN_ID}/summary")"
if command -v jq >/dev/null 2>&1; then
  echo "${summary}" | jq
else
  echo "${summary}"
fi
