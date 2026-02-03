# SwarmHarness PRD

## Problem
We need an autonomous harness that can discover and solve 30 adversarial browser levels, then execute a full run in **<= 300 seconds** with high reliability. Each level’s objective is not stated; the system must infer it via exploration, then compile deterministic solvers.

## Goals
- Autonomously discover each level’s objective without human input after start.
- Produce deterministic, minimal solvers with verifiers and micro‑fallbacks.
- Achieve >=95% pass rate for full 30‑level runs with median runtime <=300s.
- Capture enough telemetry to diagnose failures without re‑running.
- Run on a single hosted machine first; scale out without Kubernetes later.

## Non‑Goals
- Not a general‑purpose browser automation platform.
- Not for bypassing access controls or bot protections on unauthorized sites.
- No dashboard UI in the MVP.

## Success Metrics
- Full run median <=300s, p95 <=330s on a fixed host.
- Per‑level p50 <=10s in Runner mode.
- >=95% pass rate on 20 consecutive runs.
- “Failure diagnosable without rerun” >=90% (trace+logs sufficient).

## Architecture
**Split by strengths:**
- **Rust** for orchestration, telemetry, storage, skill library, minimization.
- **TypeScript + Playwright** for browser workers and artifacts (traces, HAR, screenshots).

**Core components**
1. **Orchestrator (Rust)**: schedules episodes, manages Explore→Exploit loop, promotes SkillCards.
2. **Worker (TS + Playwright)**: runs browser contexts, executes action plans, collects artifacts.
3. **Telemetryd (Rust)**: ingest JSONL events, write artifacts, store run metadata in SQLite.
4. **Skill Library (Rust)**: versioned SkillCards (fingerprint + solver + verifier + fallback).
5. **LLM Router (Rust, stubbed in MVP)**: provider‑agnostic structured calls with hedging.

## Dataflows
- Orchestrator issues episode jobs to Worker.
- Worker streams events to Telemetryd and writes artifacts to disk.
- Telemetryd indexes run metadata and writes manifests.
- SkillCards are updated and promoted based on regression gates.

## Explore → Exploit Loop
1. **Observe**: DOM/ARIA + console/network anomalies, optional screenshot.
2. **Reason**: generate hypotheses and micro‑plans (LLM‑assisted, structured).
3. **Act**: parallel rollouts in cloned contexts.
4. **Evaluate**: reward detector checks progress.
5. **Exploit**: minimize trace, harden selectors, add verifier.
6. **Update**: save SkillCard, update explorer budgets, schedule regressions.

## Observability
**Trainer mode (max capture)**
- Playwright trace + screenshots
- HAR network capture
- DOM snapshot/HTML
- Console and request failures

**Runner mode (minimal overhead)**
- Structured JSON events in ring buffer
- Heavy artifacts only on divergence or failure

## Milestones
1. **MVP vertical slice**: Orchestrator → Worker → Telemetryd, single episode end‑to‑end.
2. **Explorers**: deterministic discovery portfolio + reward detection.
3. **Exploit pipeline**: minimizer + selector hardening + verifier.
4. **Runner mode**: fast execution with ring buffer + panic dump.
5. **LLM integration**: structured hypotheses + hedging + caching.

## Risks & Mitigations
- **Flakiness/timing gates** → parallel rollouts, strict verifiers, fallback policies.
- **Logging overhead** → profile‑based capture and ring buffer in Runner mode.
- **Brittle selectors** → semantic locators first, coordinates last.

## MVP Scope (this repo)
- Action grammar: click, type, press, wait_for, scroll, eval_js.
- Worker: execute plan, capture trace/screenshot/HTML in trainer profile.
- Telemetryd: JSONL events + artifact manifests + SQLite metadata.
- Orchestrator: create run, issue single episode, collect response.
