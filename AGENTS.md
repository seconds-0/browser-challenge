# AGENTS

## Purpose
This repo implements SwarmHarness (see `docs/prd.md`). Follow TDD, strict typing, and behavior‑style tests.

## Ground Rules
- Branches must be prefixed with `codex/`.
- Keep Rust + TS types aligned (update `packages/schemas` and Rust `events` in lockstep).
- Prefer deterministic, minimal actions. Avoid flaky selectors.

## Testing Expectations
- **Behavior tests**: Playwright E2E tests in `apps/worker-playwright/tests`.
- **Rust integration tests**: in `apps/*/tests`.
- **TS unit tests**: `vitest` in packages/apps.

## Commands
- `pnpm install`
- `pnpm lint`
- `pnpm test`
- `pnpm test:e2e`
- `cargo fmt --all -- --check`
- `cargo clippy --all-targets -- -D warnings`
- `cargo test`

## Lint/Format
- Rust: `rustfmt`, `clippy`.
- TS: `eslint` + `prettier`.

## Repo Conventions
- Artifacts live under `data/runs/{run_id}/...`.
- Telemetry uses JSONL event streams + manifest references.
- Worker should stay Playwright‑first; Rust should own orchestration and ingestion.
