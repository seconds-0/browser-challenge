import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');
const pidFile = path.join(rootDir, '.playwright-pids.json');

async function waitForHealth(url: string, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup() {
  const processes: { name: string; pid: number }[] = [];

  const telemetry = spawn('cargo', ['run', '-p', 'telemetryd'], {
    cwd: rootDir,
    env: { ...process.env, DATA_DIR: path.join(rootDir, 'data'), RUST_LOG: 'info' },
    stdio: 'inherit',
  });
  processes.push({ name: 'telemetryd', pid: telemetry.pid ?? 0 });

  const worker = spawn('pnpm', ['--filter', 'worker-playwright', 'dev'], {
    cwd: rootDir,
    env: { ...process.env, DATA_DIR: path.join(rootDir, 'data'), PORT: '8080' },
    stdio: 'inherit',
  });
  processes.push({ name: 'worker', pid: worker.pid ?? 0 });

  const fixture = spawn('pnpm', ['--filter', 'fixture-web', 'dev'], {
    cwd: rootDir,
    env: { ...process.env, PORT: '3000' },
    stdio: 'inherit',
  });
  processes.push({ name: 'fixture', pid: fixture.pid ?? 0 });

  await waitForHealth('http://localhost:8081/health');
  await waitForHealth('http://localhost:8080/health');
  await waitForHealth('http://localhost:3000/');

  await fs.writeFile(pidFile, JSON.stringify(processes, null, 2), 'utf-8');
}
