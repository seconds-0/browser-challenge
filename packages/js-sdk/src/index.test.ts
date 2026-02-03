import { describe, expect, it } from 'vitest';

import { SwarmClient } from './index';

describe('SwarmClient', () => {
  it('constructs with urls', () => {
    const client = new SwarmClient({
      workerUrl: 'http://localhost:8080',
      telemetryUrl: 'http://localhost:8081',
    });
    expect(client).toBeTruthy();
  });
});
