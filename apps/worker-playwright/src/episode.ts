import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  ActionResult,
  ArtifactManifest,
  EpisodeRequest,
  EpisodeResult,
  EventEnvelope,
  RewardSignal,
} from '@swarm/schemas';

import { executeAction } from './actions';
import { writeArtifacts } from './artifacts';
import { getBrowser } from './browser';
import { DATA_DIR } from './config';
import { sendTelemetry } from './telemetry';
import { createEvent } from './utils';

export async function runEpisode(request: EpisodeRequest): Promise<EpisodeResult> {
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

  events.push(
    createEvent(request.run_id, request.level_id, episodeId, 'episode_started', {
      artifact_profile: request.artifact_profile,
      plan_actions: request.plan.actions.length,
      checkpoint_url: request.checkpoint?.url ?? null,
    }),
  );

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

  events.push(
    createEvent(request.run_id, request.level_id, episodeId, 'episode_finished', {
      result: didFail ? 'failed' : 'ok',
      reward,
      run_error: runError ?? null,
    }),
  );

  if (didFail) {
    events.push(
      createEvent(request.run_id, request.level_id, episodeId, 'alert', {
        severity: 'warn',
        reason: runError ?? 'episode_failed',
      }),
    );
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
      episode_id: episodeId,
    },
  };
}
