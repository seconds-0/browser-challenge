import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ArtifactManifest, ArtifactRef } from '@swarm/schemas';
import type { Page } from 'playwright';

import { DATA_DIR } from './config';

export async function writeArtifacts(
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
