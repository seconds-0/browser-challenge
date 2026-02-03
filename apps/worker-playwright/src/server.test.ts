import { describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';

vi.mock('./episode', () => ({
  runEpisode: vi.fn(),
}));

describe('server', () => {
  it('rejects invalid episode payloads', async () => {
    const { buildApp } = await import('./server');
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/episode/run',
      payload: { run_id: 'missing-fields' },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('accepts valid episode payloads', async () => {
    const { buildApp } = await import('./server');
    const { runEpisode } = await import('./episode');
    const runEpisodeMock = runEpisode as unknown as ReturnType<typeof vi.fn>;
    runEpisodeMock.mockResolvedValue({
      result: 'ok',
      reward: { advanced: true },
      actions_executed: [],
      diagnostics: {},
    });

    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/episode/run',
      payload: {
        run_id: 'run-1',
        level_id: 'level-1',
        checkpoint: { url: 'http://example.com' },
        plan: { actions: [] },
        time_budget_ms: 1000,
        artifact_profile: 'trainer',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { result: string };
    expect(body.result).toBe('ok');
    expect(runEpisodeMock).toHaveBeenCalled();
    await app.close();
  });
});
