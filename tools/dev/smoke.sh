#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="run-smoke-$(date +%s)"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require curl

check_health() {
  local url="$1"
  echo "Checking ${url}..."
  if ! curl -sSf "$url" >/dev/null; then
    echo "Health check failed for ${url}" >&2
    echo "Make sure services are running. Use: pnpm dev:tmux" >&2
    exit 1
  fi
}

check_health "http://localhost:3000/"
check_health "http://localhost:8080/health"
check_health "http://localhost:8081/health"

payload=$(cat <<EOF
{
  "run_id": "${RUN_ID}",
  "level_id": "level-1",
  "checkpoint": { "url": "http://localhost:3000/level/1" },
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
  "telemetry_endpoint": "http://localhost:8081"
}
EOF
)

echo "Running episode ${RUN_ID}..."
response="$(curl -sSf http://localhost:8080/episode/run \
  -H "content-type: application/json" \
  -d "${payload}")"

if command -v jq >/dev/null 2>&1; then
  echo "${response}" | jq
else
  echo "${response}"
fi

echo "Fetching run summary..."
summary="$(curl -sSf "http://localhost:8081/runs/${RUN_ID}/summary")"
if command -v jq >/dev/null 2>&1; then
  echo "${summary}" | jq
else
  echo "${summary}"
fi

echo "Artifacts:"
ls -la "${ROOT_DIR}/data/runs/${RUN_ID}" || true
