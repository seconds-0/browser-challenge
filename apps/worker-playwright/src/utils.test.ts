import { describe, expect, it } from 'vitest';

import { createEvent } from './utils';

describe('createEvent', () => {
  it('creates a valid event envelope', () => {
    const event = createEvent('run-1', 'level-1', 'episode-1', 'action', { ok: true });
    expect(event.run_id).toBe('run-1');
    expect(event.kind).toBe('action');
    expect(event.data).toEqual({ ok: true });
  });
});
