import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');
const pidFile = path.join(rootDir, '.playwright-pids.json');

export default async function globalTeardown() {
  try {
    const data = await fs.readFile(pidFile, 'utf-8');
    const processes: { name: string; pid: number }[] = JSON.parse(data);
    for (const proc of processes) {
      if (proc.pid) {
        try {
          process.kill(proc.pid, 'SIGTERM');
        } catch {
          // ignore
        }
      }
    }
    await fs.unlink(pidFile);
  } catch {
    // ignore
  }
}
