import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ArtifactManifest } from '@swarm/schemas';
import type { Page } from 'playwright';
import { beforeAll, describe, expect, it } from 'vitest';

type WriteArtifacts = (
  runId: string,
  levelId: string,
  episodeId: string,
  profile: 'trainer' | 'runner',
  page: Page,
  contextDir: string,
  didFail: boolean,
  traceEnabled: boolean,
) => Promise<ArtifactManifest | undefined>;

let writeArtifacts: WriteArtifacts;
let tempRoot: string;

beforeAll(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-artifacts-'));
  process.env.DATA_DIR = tempRoot;
  ({ writeArtifacts } = await import('./artifacts'));
});

function createPageMock(): Page {
  return {
    screenshot: async ({ path: targetPath }: { path: string }) => {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, 'png');
    },
    content: async () => '<html><body>ok</body></html>',
  } as unknown as Page;
}

describe('writeArtifacts', () => {
  it('writes trainer artifacts with relative paths', async () => {
    const page = createPageMock();
    const episodeDir = path.join(
      tempRoot,
      'runs',
      'run-1',
      'levels',
      'level-1',
      'episodes',
      'episode-1',
    );

    const manifest = await writeArtifacts(
      'run-1',
      'level-1',
      'episode-1',
      'trainer',
      page,
      episodeDir,
      false,
      true,
    );

    expect(manifest).toBeTruthy();
    const kinds = manifest?.artifacts.map((artifact) => artifact.kind);
    expect(kinds).toEqual(expect.arrayContaining(['screenshot', 'dom', 'trace']));
    for (const artifact of manifest?.artifacts ?? []) {
      expect(artifact.path.startsWith(tempRoot)).toBe(false);
    }

    const screenshot = manifest?.artifacts.find((artifact) => artifact.kind === 'screenshot');
    const dom = manifest?.artifacts.find((artifact) => artifact.kind === 'dom');
    await expect(fs.stat(path.join(tempRoot, screenshot?.path ?? ''))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(tempRoot, dom?.path ?? ''))).resolves.toBeTruthy();
  });

  it('returns undefined for runner without failure', async () => {
    const page = createPageMock();
    const episodeDir = path.join(
      tempRoot,
      'runs',
      'run-2',
      'levels',
      'level-2',
      'episodes',
      'episode-2',
    );

    const manifest = await writeArtifacts(
      'run-2',
      'level-2',
      'episode-2',
      'runner',
      page,
      episodeDir,
      false,
      false,
    );

    expect(manifest).toBeUndefined();
  });
});
