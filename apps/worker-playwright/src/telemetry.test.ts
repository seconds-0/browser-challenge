import http from 'node:http';

import { describe, expect, it } from 'vitest';

describe('sendTelemetry', () => {
  it('posts JSON payload and tolerates failures', async () => {
    process.env.TELEMETRY_TIMEOUT_MS = '200';
    const { sendTelemetry } = await import('./telemetry');

    let received: string | undefined;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        received = body;
        res.statusCode = 200;
        res.end('ok');
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to bind test server');
    }

    await sendTelemetry(`http://127.0.0.1:${address.port}/events`, { run_id: 'run-1' });
    server.close();

    expect(received).toContain('"run_id":"run-1"');

    await sendTelemetry('http://127.0.0.1:1/events', { run_id: 'run-2' });
  });
});
