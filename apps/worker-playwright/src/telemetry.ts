import { TELEMETRY_TIMEOUT_MS } from './config';

export async function sendTelemetry(endpoint: string, payload: unknown): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS);
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    console.warn('telemetry_post_failed', { endpoint, error: String(err) });
  } finally {
    clearTimeout(timeoutId);
  }
}
