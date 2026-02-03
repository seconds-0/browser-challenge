import type { Page } from 'playwright';
import { describe, expect, it, vi } from 'vitest';

import { executeAction, resolveLocator } from './actions';

type LocatorMock = {
  click: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  waitFor: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
};

function createPageMock() {
  const locator: LocatorMock = {
    click: vi.fn(),
    fill: vi.fn(),
    waitFor: vi.fn(),
    focus: vi.fn(),
  };
  const page = {
    locator: vi.fn().mockReturnValue(locator),
    getByText: vi.fn().mockReturnValue(locator),
    getByTestId: vi.fn().mockReturnValue(locator),
    getByRole: vi.fn().mockReturnValue(locator),
    mouse: {
      click: vi.fn(),
      wheel: vi.fn(),
    },
    keyboard: {
      press: vi.fn(),
    },
    waitForURL: vi.fn(),
    waitForTimeout: vi.fn(),
    evaluate: vi.fn(),
  };
  return { page: page as unknown as Page, locator };
}

describe('resolveLocator', () => {
  it('uses css strategy', () => {
    const { page } = createPageMock();
    resolveLocator(page, {
      id: 'a',
      type: 'click',
      target: { selector: { strategy: 'css', value: '#target' } },
    });
    expect(page.locator).toHaveBeenCalledWith('#target');
  });

  it('uses role strategy', () => {
    const { page } = createPageMock();
    resolveLocator(page, {
      id: 'a',
      type: 'click',
      target: { selector: { strategy: 'role', value: 'button:Save' } },
    });
    expect(page.getByRole).toHaveBeenCalledWith('button', { name: 'Save' });
  });

  it('throws when selector target is missing', () => {
    const { page } = createPageMock();
    expect(() =>
      resolveLocator(page, {
        id: 'a',
        type: 'click',
      }),
    ).toThrow(/missing selector target/);
  });
});

describe('executeAction', () => {
  it('clicks locator with timeout', async () => {
    const { page, locator } = createPageMock();
    await executeAction(
      page,
      {
        id: 'a',
        type: 'click',
        target: { selector: { strategy: 'css', value: '#target' } },
      },
      500,
    );
    expect(locator.click).toHaveBeenCalledWith({ timeout: 500 });
  });

  it('types into locator', async () => {
    const { page, locator } = createPageMock();
    await executeAction(
      page,
      {
        id: 'a',
        type: 'type',
        text: 'hello',
        target: { selector: { strategy: 'test_id', value: 'input' } },
      },
      500,
    );
    expect(locator.fill).toHaveBeenCalledWith('hello', { timeout: 500 });
  });

  it('press focuses target before key', async () => {
    const { page, locator } = createPageMock();
    await executeAction(
      page,
      {
        id: 'a',
        type: 'press',
        key: 'Enter',
        target: { selector: { strategy: 'css', value: '#target' } },
      },
      500,
    );
    expect(locator.focus).toHaveBeenCalledWith({ timeout: 500 });
    expect(page.keyboard.press).toHaveBeenCalledWith('Enter');
  });

  it('wait_for url uses waitForURL', async () => {
    const { page } = createPageMock();
    await executeAction(
      page,
      {
        id: 'a',
        type: 'wait_for',
        wait_for: { url_contains: '/done', timeout_ms: 1000 },
      },
      5000,
    );
    expect(page.waitForURL).toHaveBeenCalledWith('**/done**', { timeout: 1000 });
  });

  it('scroll uses mouse wheel', async () => {
    const { page } = createPageMock();
    await executeAction(
      page,
      {
        id: 'a',
        type: 'scroll',
        scroll: { delta_x: 0, delta_y: 500 },
      },
      500,
    );
    expect(page.mouse.wheel).toHaveBeenCalledWith(0, 500);
  });

  it('eval_js uses page.evaluate', async () => {
    const { page } = createPageMock();
    await executeAction(
      page,
      {
        id: 'a',
        type: 'eval_js',
        script: '1 + 1',
      },
      500,
    );
    expect(page.evaluate).toHaveBeenCalledWith('1 + 1');
  });
});
