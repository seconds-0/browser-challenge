import type { Action } from '@swarm/schemas';
import type { Page } from 'playwright';

export function resolveLocator(page: Page, action: Action) {
  const target = action.target?.selector;
  if (!target) {
    throw new Error(`action ${action.id} missing selector target`);
  }
  switch (target.strategy) {
    case 'css':
      return page.locator(target.value);
    case 'text':
      return page.getByText(target.value);
    case 'test_id':
      return page.getByTestId(target.value);
    case 'role': {
      const [role, name] = target.value.split(':');
      return page.getByRole(role as never, name ? { name } : undefined);
    }
  }
}

export async function executeAction(page: Page, action: Action, timeoutMs: number): Promise<void> {
  const boundedTimeout = Math.max(0, timeoutMs);
  switch (action.type) {
    case 'click': {
      if (action.target?.point) {
        await page.mouse.click(action.target.point.x, action.target.point.y);
        return;
      }
      const locator = resolveLocator(page, action);
      await locator.click({ timeout: boundedTimeout });
      return;
    }
    case 'type': {
      const locator = resolveLocator(page, action);
      await locator.fill(action.text ?? '', { timeout: boundedTimeout });
      return;
    }
    case 'press': {
      if (!action.key) {
        throw new Error('press action missing key');
      }
      if (action.target?.selector) {
        const locator = resolveLocator(page, action);
        await locator.focus({ timeout: boundedTimeout });
      } else if (action.target?.point) {
        await page.mouse.click(action.target.point.x, action.target.point.y);
      }
      await page.keyboard.press(action.key);
      return;
    }
    case 'wait_for': {
      const timeout =
        Math.min(
          action.wait_for?.timeout_ms ?? action.timeout_ms ?? boundedTimeout,
          boundedTimeout,
        ) || boundedTimeout;
      if (action.wait_for?.url_contains) {
        await page.waitForURL(`**${action.wait_for.url_contains}**`, { timeout });
        return;
      }
      if (action.wait_for?.selector) {
        const locator = resolveLocator(page, {
          ...action,
          target: { selector: action.wait_for.selector },
        });
        await locator.waitFor({ timeout });
        return;
      }
      if (timeout) {
        await page.waitForTimeout(timeout);
        return;
      }
      return;
    }
    case 'scroll': {
      const deltaX = action.scroll?.delta_x ?? 0;
      const deltaY = action.scroll?.delta_y ?? 0;
      await page.mouse.wheel(deltaX, deltaY);
      return;
    }
    case 'eval_js': {
      if (!action.script) {
        throw new Error('eval_js action missing script');
      }
      await page.evaluate(action.script);
      return;
    }
    default:
      throw new Error(`unsupported action type: ${action.type}`);
  }
}
