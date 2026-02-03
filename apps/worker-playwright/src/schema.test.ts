import { describe, expect, it } from 'vitest';

import { EpisodeRequestSchema } from './schema';

describe('EpisodeRequestSchema', () => {
  it('accepts a valid episode request', () => {
    const result = EpisodeRequestSchema.safeParse({
      run_id: 'run-1',
      level_id: 'level-1',
      checkpoint: { url: 'http://example.com' },
      plan: {
        actions: [
          {
            id: 'click',
            type: 'click',
            target: { selector: { strategy: 'css', value: '#target' } },
          },
        ],
      },
      time_budget_ms: 1000,
      artifact_profile: 'trainer',
      telemetry_endpoint: 'http://localhost:8081',
    });

    expect(result.success).toBe(true);
  });

  it('rejects unsupported action types', () => {
    const result = EpisodeRequestSchema.safeParse({
      run_id: 'run-1',
      level_id: 'level-1',
      plan: { actions: [{ id: 'bad', type: 'invalid' }] },
      time_budget_ms: 1000,
      artifact_profile: 'trainer',
    });

    expect(result.success).toBe(false);
  });
});
