# SwarmHarness MVP

Rust + TypeScript monorepo implementing a minimal vertical slice of the SwarmHarness architecture.

## Quick Start

```bash
pnpm install
pnpm test
pnpm test:e2e
cargo test
```

## Services
- `apps/telemetryd`: Rust HTTP ingest (SQLite + JSONL)
- `apps/worker-playwright`: TS Playwright worker
- `apps/orchestrator`: Rust orchestrator stub
- `apps/fixture-web`: tiny web app for behavior tests

## Data
Artifacts and event logs are written to `data/runs/{run_id}/...`.

## Observability
- Worker emits structured `action_started/action_finished/action_failed` events plus `episode_started/episode_finished`.
- Telemetryd stores JSONL on disk and also indexes events/artifacts in the database for querying.
- Query endpoints:
  - `GET /runs/:run_id`
  - `GET /runs/:run_id/events?limit=1000`
  - `GET /runs/:run_id/artifacts?limit=1000`

## Configuration
- `DATA_DIR`: root for artifacts and SQLite DB (default `data`).
- `DATABASE_URL`: optional. If set, telemetryd will use this database (supports SQLite/Postgres).
- `TELEMETRY_TIMEOUT_MS`: worker telemetry post timeout (default 500ms).

See `docs/prd.md` for the architecture and product requirements.
