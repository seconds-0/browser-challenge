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
      await expect(fs.stat(path.join(dataDir, artifact.path))).resolves.toBeTruthy();
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

test('Scenario 5: press action focuses target before keypress', async () => {
  const runId = `run-press-${Date.now()}`;
  const plan = {
    actions: [
      {
        id: 'press-space',
        type: 'press',
        key: 'Space',
        target: { selector: { strategy: 'test_id', value: 'press-target' } },
      },
    ],
  };

  const result = await runEpisode(runId, 'level-5', 'http://localhost:3000/level/5', plan);
  expect(result.result).toBe('ok');
  expect(result.reward.advanced).toBeTruthy();
});

test('Scenario 6: time budget caps long wait_for', async () => {
  const runId = `run-budget-${Date.now()}`;
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
    ],
  };

  const response = await fetch('http://localhost:8080/episode/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      run_id: runId,
      level_id: 'level-4',
      checkpoint: { url: 'http://localhost:3000/level/4' },
      plan,
      time_budget_ms: 200,
      artifact_profile: 'runner',
      telemetry_endpoint: 'http://localhost:8081',
    }),
  });

  expect(response.ok).toBeTruthy();
  const result = (await response.json()) as {
    result: string;
    actions_executed: { success: boolean; error?: string }[];
  };
  expect(result.result).toBe('failed');
  expect(result.actions_executed[0]?.success).toBe(false);
  expect(result.actions_executed[0]?.error).toContain('Timeout');
});

test('Scenario 7: scroll action reveals target', async () => {
  const runId = `run-scroll-${Date.now()}`;
  const plan = {
    actions: [
      {
        id: 'scroll-down',
        type: 'scroll',
        scroll: { delta_x: 0, delta_y: 1600 },
      },
      {
        id: 'click-scroll-target',
        type: 'click',
        target: { selector: { strategy: 'test_id', value: 'scroll-target' } },
      },
    ],
  };

  const result = await runEpisode(runId, 'level-6', 'http://localhost:3000/level/6', plan);
  expect(result.result).toBe('ok');
  expect(result.reward.advanced).toBeTruthy();
});

test('Scenario 8: eval_js advances the level', async () => {
  const runId = `run-eval-${Date.now()}`;
  const plan = {
    actions: [
      {
        id: 'eval-advance',
        type: 'eval_js',
        script: 'window.advanceLevel()',
      },
    ],
  };

  const result = await runEpisode(runId, 'level-7', 'http://localhost:3000/level/7', plan);
  expect(result.result).toBe('ok');
  expect(result.reward.advanced).toBeTruthy();
});

test('Scenario 9: wait_for url_contains observes navigation', async () => {
  const runId = `run-url-${Date.now()}`;
  const plan = {
    actions: [
      {
        id: 'click-nav',
        type: 'click',
        target: { selector: { strategy: 'test_id', value: 'nav' } },
      },
      {
        id: 'wait-url',
        type: 'wait_for',
        wait_for: { url_contains: '/level/8/next', timeout_ms: 5000 },
      },
    ],
  };

  const result = await runEpisode(runId, 'level-8', 'http://localhost:3000/level/8', plan);
  expect(result.result).toBe('ok');
  expect(result.reward.advanced).toBeTruthy();
});

test('Scenario 10: selector strategies (role/text/css) all work', async () => {
  const runId = `run-selectors-${Date.now()}`;
  const plan = {
    actions: [
      {
        id: 'role-click',
        type: 'click',
        target: { selector: { strategy: 'role', value: 'button:Role Target' } },
      },
      {
        id: 'text-click',
        type: 'click',
        target: { selector: { strategy: 'text', value: 'Text Target' } },
      },
      {
        id: 'css-click',
        type: 'click',
        target: { selector: { strategy: 'css', value: '#css-target' } },
      },
    ],
  };

  const result = await runEpisode(runId, 'level-9', 'http://localhost:3000/level/9', plan);
  expect(result.result).toBe('ok');
  expect(result.reward.advanced).toBeTruthy();
});

test('Scenario 11: coordinate click works', async () => {
  const runId = `run-coords-${Date.now()}`;
  const plan = {
    actions: [
      {
        id: 'click-coordinates',
        type: 'click',
        target: { point: { x: 60, y: 60 } },
      },
    ],
  };

  const result = await runEpisode(runId, 'level-10', 'http://localhost:3000/level/10', plan);
  expect(result.result).toBe('ok');
  expect(result.reward.advanced).toBeTruthy();
});
