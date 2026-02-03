# Operations & Observability

## Telemetry
- Worker emits structured events per action + episode start/finish.
- Telemetryd persists JSONL to disk and also indexes events/artifacts in the DB for queries.

### Query endpoints
- `GET /runs/:run_id`
- `GET /runs/:run_id/events?limit=1000`
- `GET /runs/:run_id/artifacts?limit=1000`

## Database
- Default: SQLite at `DATA_DIR/telemetry.sqlite`.
- To use Postgres (e.g., Railway), set `DATABASE_URL`.

## Hosting (Railway)
Recommended services:
- `telemetryd` (Rust)
- `worker-playwright` (Node)
- `fixture-web` (Node, dev only)

Minimal Railway setup:
1. Create a Railway project.
2. Add a Postgres service.
3. Deploy `apps/telemetryd` with `DATABASE_URL` wired to Postgres.
4. Deploy `apps/worker-playwright` with `TELEMETRY_TIMEOUT_MS` as needed.

Notes:
- For production runs, move artifact storage to object storage and store relative paths/URLs in manifests.
- Keep `DATA_DIR` on a persistent volume if using local storage.
