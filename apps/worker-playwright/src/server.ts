import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  Action,
  ActionPlan,
  ActionResult,
  ArtifactManifest,
  ArtifactRef,
  EpisodeRequest,
  EpisodeResult,
  EventEnvelope,
  RewardSignal,
} from '@swarm/schemas';
import Fastify from 'fastify';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from 'zod';

import { createEvent } from './utils';

const ActionTypeSchema = z.enum(['click', 'type', 'press', 'wait_for', 'scroll', 'eval_js']);

const SelectorSchema = z.object({
  strategy: z.enum(['css', 'role', 'text', 'test_id']),
  value: z.string(),
});

const ActionSchema: z.ZodType<Action> = z.object({
  id: z.string(),
  type: ActionTypeSchema,
  target: z
    .object({
      selector: SelectorSchema.optional(),
      point: z
        .object({
          x: z.number(),
          y: z.number(),
        })
        .optional(),
      frame: z.string().optional(),
    })
    .optional(),
  text: z.string().optional(),
  key: z.string().optional(),
  timeout_ms: z.number().optional(),
  wait_for: z
    .object({
      url_contains: z.string().optional(),
      selector: SelectorSchema.optional(),
      timeout_ms: z.number().optional(),
    })
    .optional(),
  scroll: z
    .object({
      delta_x: z.number(),
      delta_y: z.number(),
    })
    .optional(),
  script: z.string().optional(),
});

const EpisodeRequestSchema: z.ZodType<EpisodeRequest> = z.object({
  run_id: z.string(),
  level_id: z.string(),
  checkpoint: z
    .object({
      url: z.string(),
      storage_state_path: z.string().optional(),
    })
    .optional(),
  plan: z.object({
    actions: z.array(ActionSchema),
  }) as z.ZodType<ActionPlan>,
  time_budget_ms: z.number(),
  artifact_profile: z.enum(['trainer', 'runner']),
  telemetry_endpoint: z.string().optional(),
});

const DATA_DIR = process.env.DATA_DIR || 'data';
const PORT = Number(process.env.PORT || 8080);

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

async function executeAction(page: Page, action: Action, timeoutMs: number): Promise<void> {
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

function resolveLocator(page: Page, action: Action) {
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

async function writeArtifacts(
  runId: string,
  levelId: string,
  episodeId: string,
  profile: 'trainer' | 'runner',
  page: Page,
  contextDir: string,
  didFail: boolean,
  traceEnabled: boolean,
): Promise<ArtifactManifest | undefined> {
  const artifacts: ArtifactRef[] = [];
  const toManifestPath = (absolutePath: string) => path.relative(DATA_DIR, absolutePath);

  if (profile === 'trainer' || didFail) {
    const screenshotPath = path.join(contextDir, 'snapshots', 'final.png');
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    artifacts.push({
      kind: 'screenshot',
      path: toManifestPath(screenshotPath),
      content_type: 'image/png',
    });

    const htmlPath = path.join(contextDir, 'dom', 'final.html');
    await mkdir(path.dirname(htmlPath), { recursive: true });
    const html = await page.content();
    await writeFile(htmlPath, html, 'utf-8');
    artifacts.push({ kind: 'dom', path: toManifestPath(htmlPath), content_type: 'text/html' });
  }

  if (traceEnabled) {
    const tracePath = path.join(contextDir, 'trace', 'trace.zip');
    await mkdir(path.dirname(tracePath), { recursive: true });
    artifacts.push({
      kind: 'trace',
      path: toManifestPath(tracePath),
      content_type: 'application/zip',
    });
  }

  if (!artifacts.length) {
    return undefined;
  }

  return {
    run_id: runId,
    level_id: levelId,
    episode_id: episodeId,
    artifacts,
  };
}

async function sendTelemetry(endpoint: string, payload: unknown): Promise<void> {
  const timeoutMs = Number(process.env.TELEMETRY_TIMEOUT_MS || 500);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
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

async function runEpisode(request: EpisodeRequest): Promise<EpisodeResult> {
  const episodeId = randomUUID();
  const runDir = path.join(DATA_DIR, 'runs', request.run_id, 'levels', request.level_id);
  const episodeDir = path.join(runDir, 'episodes', episodeId);
  await mkdir(episodeDir, { recursive: true });

  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleMessages: Record<string, unknown>[] = [];
  const pageErrors: string[] = [];
  const requestFailures: Record<string, unknown>[] = [];

  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  page.on('requestfailed', (req) => {
    requestFailures.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  const timeStart = Date.now();

  const events: EventEnvelope[] = [];
  const actionResults: ActionResult[] = [];
  let didFail = false;
  let reward: RewardSignal = { advanced: false, reason: 'no_change' };
  let artifacts: ArtifactManifest | undefined;
  let runError: string | undefined;

  const traceEnabled = request.artifact_profile === 'trainer';
  const tracePath = path.join(episodeDir, 'trace', 'trace.zip');
  let traceActive = false;

  try {
    if (traceEnabled) {
      await context.tracing.start({ screenshots: true, snapshots: true });
      traceActive = true;
    }

    if (request.checkpoint?.url) {
      const remaining = request.time_budget_ms - (Date.now() - timeStart);
      if (remaining <= 0) {
        throw new Error('time_budget_exceeded');
      }
      await page.goto(request.checkpoint.url, {
        waitUntil: 'domcontentloaded',
        timeout: remaining,
      });
    }

    const initialFingerprint = await page.evaluate(() => document.body?.dataset?.level || '');

    for (const action of request.plan.actions) {
      const stepStart = new Date();
      events.push(
        createEvent(
          request.run_id,
          request.level_id,
          episodeId,
          'action_started',
          {
            action,
          },
          action.id,
        ),
      );
      try {
        const remaining = request.time_budget_ms - (Date.now() - timeStart);
        if (remaining <= 0) {
          throw new Error('time_budget_exceeded');
        }
        page.setDefaultTimeout(remaining);
        await executeAction(page, action, remaining);
        const stepEnd = new Date();
        actionResults.push({
          action_id: action.id,
          success: true,
          error: undefined,
          started_at: stepStart.toISOString(),
          ended_at: stepEnd.toISOString(),
          duration_ms: stepEnd.getTime() - stepStart.getTime(),
        });
        events.push(
          createEvent(
            request.run_id,
            request.level_id,
            episodeId,
            'action_finished',
            {
              action_id: action.id,
            },
            action.id,
          ),
        );
      } catch (err) {
        didFail = true;
        const stepEnd = new Date();
        actionResults.push({
          action_id: action.id,
          success: false,
          error: err instanceof Error ? err.message : 'unknown_error',
          started_at: stepStart.toISOString(),
          ended_at: stepEnd.toISOString(),
          duration_ms: stepEnd.getTime() - stepStart.getTime(),
        });
        events.push(
          createEvent(
            request.run_id,
            request.level_id,
            episodeId,
            'action_failed',
            {
              action_id: action.id,
              error: err instanceof Error ? err.message : String(err),
            },
            action.id,
          ),
        );
        break;
      }
    }

    const finalFingerprint = await page.evaluate(() => document.body?.dataset?.level || '');
    reward = {
      advanced: finalFingerprint !== initialFingerprint,
      reason: finalFingerprint !== initialFingerprint ? 'level_changed' : 'no_change',
      level_fingerprint: finalFingerprint || undefined,
    };

    if (traceEnabled) {
      await mkdir(path.dirname(tracePath), { recursive: true });
      await context.tracing.stop({ path: tracePath });
      traceActive = false;
    }

    artifacts = await writeArtifacts(
      request.run_id,
      request.level_id,
      episodeId,
      request.artifact_profile,
      page,
      episodeDir,
      didFail,
      traceEnabled,
    );
  } catch (err) {
    didFail = true;
    runError = err instanceof Error ? err.message : String(err);
  } finally {
    if (traceEnabled && traceActive) {
      try {
        await mkdir(path.dirname(tracePath), { recursive: true });
        await context.tracing.stop({ path: tracePath });
      } catch {
        // ignore cleanup errors
      }
    }
    await context.close();
  }

  if (request.telemetry_endpoint) {
    await sendTelemetry(`${request.telemetry_endpoint}/events`, {
      run_id: request.run_id,
      level_id: request.level_id,
      episode_id: episodeId,
      events: [
        ...events,
        createEvent(request.run_id, request.level_id, episodeId, 'console', {
          messages: consoleMessages,
        }),
        createEvent(request.run_id, request.level_id, episodeId, 'page_error', {
          errors: pageErrors,
        }),
        createEvent(request.run_id, request.level_id, episodeId, 'request_failed', {
          requests: requestFailures,
        }),
      ],
    });

    if (artifacts) {
      await sendTelemetry(`${request.telemetry_endpoint}/artifacts`, {
        run_id: request.run_id,
        level_id: request.level_id,
        episode_id: episodeId,
        manifest: artifacts,
      });
    }
  }

  return {
    result: didFail ? 'failed' : 'ok',
    reward,
    actions_executed: actionResults,
    artifacts,
    diagnostics: {
      console_messages: consoleMessages.length,
      page_errors: pageErrors.length,
      request_failures: requestFailures.length,
      run_error: runError,
    },
  };
}

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));

app.post('/episode/run', async (request, reply) => {
  const parsed = EpisodeRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.code(400);
    return { error: parsed.error.flatten() };
  }

  const result = await runEpisode(parsed.data);
  return result;
});

async function shutdown() {
  await app.close();
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
  }
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

app.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
