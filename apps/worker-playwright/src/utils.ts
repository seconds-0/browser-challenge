import type { EventEnvelope } from '@swarm/schemas';

export function nowIso(): string {
  return new Date().toISOString();
}

export function createEvent(
  runId: string,
  levelId: string,
  episodeId: string,
  kind: string,
  data: Record<string, unknown>,
  stepId?: string,
): EventEnvelope {
  return {
    run_id: runId,
    level_id: levelId,
    episode_id: episodeId,
    step_id: stepId,
    ts: nowIso(),
    kind,
    data,
  };
}
