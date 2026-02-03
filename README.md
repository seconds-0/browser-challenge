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

See `docs/prd.md` for the architecture and product requirements.
