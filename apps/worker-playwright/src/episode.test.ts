import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ArtifactManifest, EpisodeRequest } from '@swarm/schemas';
import type { Page } from 'playwright';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBrowserMock = vi.fn();
const executeActionMock = vi.fn();
const writeArtifactsMock = vi.fn();
const sendTelemetryMock = vi.fn();

vi.mock('./browser', () => ({
  getBrowser: (...args: unknown[]) => getBrowserMock(...args),
}));
vi.mock('./actions', () => ({
  executeAction: (...args: unknown[]) => executeActionMock(...args),
}));
vi.mock('./artifacts', () => ({
  writeArtifacts: (...args: unknown[]) => writeArtifactsMock(...args),
}));
vi.mock('./telemetry', () => ({
  sendTelemetry: (...args: unknown[]) => sendTelemetryMock(...args),
}));

describe('runEpisode', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-episode-'));
    process.env.DATA_DIR = tempDir;
    executeActionMock.mockReset();
    writeArtifactsMock.mockReset();
    sendTelemetryMock.mockReset();
    getBrowserMock.mockReset();
  });

  it('executes actions and records success', async () => {
    vi.resetModules();

    const page: Partial<Page> = {
      on: vi.fn(),
      goto: vi.fn(),
      evaluate: vi
        .fn()
        .mockResolvedValueOnce('level-1')
        .mockResolvedValueOnce('level-2'),
      setDefaultTimeout: vi.fn(),
    };

    const context = {
      newPage: vi.fn().mockResolvedValue(page),
      tracing: { start: vi.fn(), stop: vi.fn() },
      close: vi.fn(),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context),
    };
    getBrowserMock.mockResolvedValue(browser);
    executeActionMock.mockResolvedValue(undefined);

    const manifest: ArtifactManifest = {
      run_id: 'run-1',
      level_id: 'level-1',
      episode_id: 'episode-test',
      artifacts: [{ kind: 'trace', path: 'runs/run-1/trace.zip' }],
    };
    writeArtifactsMock.mockResolvedValue(manifest);

    const { runEpisode } = await import('./episode');

    const request: EpisodeRequest = {
      run_id: 'run-1',
      level_id: 'level-1',
      checkpoint: { url: 'http://example.com' },
      plan: {
        actions: [
          {
            id: 'a1',
            type: 'click',
            target: { selector: { strategy: 'css', value: '#target' } },
          },
        ],
      },
      time_budget_ms: 10_000,
      artifact_profile: 'trainer',
      telemetry_endpoint: 'http://telemetry',
    };

    const result = await runEpisode(request);

    expect(result.result).toBe('ok');
    expect(result.reward.advanced).toBe(true);
    expect(context.tracing.start).toHaveBeenCalled();
    expect(context.tracing.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
    expect(executeActionMock).toHaveBeenCalled();
    expect(sendTelemetryMock).toHaveBeenCalled();
  });

  it('records failures and emits alerts', async () => {
    vi.resetModules();

    const page: Partial<Page> = {
      on: vi.fn(),
      goto: vi.fn(),
      evaluate: vi.fn().mockResolvedValue('level-1'),
      setDefaultTimeout: vi.fn(),
    };
    const context = {
      newPage: vi.fn().mockResolvedValue(page),
      tracing: { start: vi.fn(), stop: vi.fn() },
      close: vi.fn(),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context),
    };
    getBrowserMock.mockResolvedValue(browser);
    executeActionMock.mockRejectedValue(new Error('boom'));
    writeArtifactsMock.mockResolvedValue(undefined);

    const { runEpisode } = await import('./episode');

    const request: EpisodeRequest = {
      run_id: 'run-2',
      level_id: 'level-2',
      checkpoint: { url: 'http://example.com' },
      plan: {
        actions: [
          {
            id: 'a1',
            type: 'click',
            target: { selector: { strategy: 'css', value: '#target' } },
          },
        ],
      },
      time_budget_ms: 10_000,
      artifact_profile: 'runner',
      telemetry_endpoint: 'http://telemetry',
    };

    const result = await runEpisode(request);

    expect(result.result).toBe('failed');
    expect(result.actions_executed[0]?.success).toBe(false);

    const eventsCall = sendTelemetryMock.mock.calls.find((call) =>
      String(call[0]).endsWith('/events'),
    );
    expect(eventsCall).toBeTruthy();
    const payload = eventsCall?.[1] as { events: { kind: string }[] };
    expect(payload.events.some((event) => event.kind === 'alert')).toBe(true);
    expect(context.close).toHaveBeenCalled();
  });
});
