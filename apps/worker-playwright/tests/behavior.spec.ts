import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');
const dataDir = path.join(rootDir, 'data');

async function runEpisode(runId: string, levelId: string, url: string, plan: unknown) {
  const response = await fetch('http://localhost:8080/episode/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      run_id: runId,
      level_id: levelId,
      checkpoint: { url },
      plan,
      time_budget_ms: 10_000,
      artifact_profile: 'trainer',
      telemetry_endpoint: 'http://localhost:8081',
    }),
  });

  expect(response.ok).toBeTruthy();
  return (await response.json()) as {
    result: string;
    reward: { advanced: boolean };
    artifacts?: { run_id: string; level_id: string; episode_id: string; artifacts: any[] };
  };
}

test('Scenario 1: click correct button advances the level', async () => {
  const runId = `run-click-${Date.now()}`;
  const plan = {
    actions: [
      {
        id: 'click-right',
        type: 'click',
        target: { selector: { strategy: 'test_id', value: 'right' } },
      },
    ],
  };

  const result = await runEpisode(runId, 'level-1', 'http://localhost:3000/level/1', plan);
  expect(result.result).toBe('ok');
  expect(result.reward.advanced).toBeTruthy();

  const eventsPath = path.join(dataDir, 'runs', runId, 'events.jsonl');
  await expect(fs.stat(eventsPath)).resolves.toBeTruthy();

  expect(result.artifacts).toBeTruthy();
  if (result.artifacts) {
    for (const artifact of result.artifacts.artifacts) {
      await expect(fs.stat(artifact.path)).resolves.toBeTruthy();
    }
  }
});

test('Scenario 2: keyboard-only interaction works', async () => {
  const runId = `run-key-${Date.now()}`;
  const plan = {
    actions: [
      {
        id: 'focus-btn',
        type: 'click',
        target: { selector: { strategy: 'test_id', value: 'keyboard' } },
      },
      {
        id: 'press-enter',
        type: 'press',
        key: 'Enter',
      },
    ],
  };

  const result = await runEpisode(runId, 'level-2', 'http://localhost:3000/level/2', plan);
  expect(result.result).toBe('ok');
  expect(result.reward.advanced).toBeTruthy();
});

test('Scenario 3: overlay trap removes overlay before click', async () => {
  const runId = `run-overlay-${Date.now()}`;
  const plan = {
    actions: [
      {
        id: 'dismiss-overlay',
        type: 'click',
        target: { selector: { strategy: 'test_id', value: 'dismiss' } },
      },
      {
        id: 'click-target',
        type: 'click',
        target: { selector: { strategy: 'test_id', value: 'target' } },
      },
    ],
  };

  const result = await runEpisode(runId, 'level-3', 'http://localhost:3000/level/3', plan);
  expect(result.result).toBe('ok');
  expect(result.reward.advanced).toBeTruthy();
});

test('Scenario 4: wait_for respects timeout and sees delayed button', async () => {
  const runId = `run-delay-${Date.now()}`;
  const plan = {
    actions: [
      {
        id: 'wait-button',
        type: 'wait_for',
        wait_for: {
          selector: { strategy: 'test_id', value: 'delayed' },
          timeout_ms: 5000,
        },
      },
      {
        id: 'click-delayed',
        type: 'click',
        target: { selector: { strategy: 'test_id', value: 'delayed' } },
      },
    ],
  };

  const result = await runEpisode(runId, 'level-4', 'http://localhost:3000/level/4', plan);
  expect(result.result).toBe('ok');
  expect(result.reward.advanced).toBeTruthy();
});
