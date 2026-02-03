import { beforeEach, describe, expect, it, vi } from 'vitest';

const launch = vi.fn();

vi.mock('playwright', () => ({
  chromium: {
    launch,
  },
}));

describe('browser lifecycle', () => {
  beforeEach(() => {
    launch.mockReset();
  });

  it('reuses a single browser instance', async () => {
    const close = vi.fn();
    launch.mockResolvedValue({ close });
    const { getBrowser, closeBrowser } = await import('./browser');

    const first = await getBrowser();
    const second = await getBrowser();

    expect(first).toBe(second);
    expect(launch).toHaveBeenCalledTimes(1);

    await closeBrowser();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
