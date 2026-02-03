import Fastify from 'fastify';

import { closeBrowser } from './browser';
import { PORT } from './config';
import { runEpisode } from './episode';
import { EpisodeRequestSchema } from './schema';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/episode/run', async (request, reply) => {
    const parsed = EpisodeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }

    const start = Date.now();
    request.log.info(
      {
        run_id: parsed.data.run_id,
        level_id: parsed.data.level_id,
        artifact_profile: parsed.data.artifact_profile,
      },
      'episode_started',
    );
    const result = await runEpisode(parsed.data);
    request.log.info(
      {
        run_id: parsed.data.run_id,
        level_id: parsed.data.level_id,
        result: result.result,
        duration_ms: Date.now() - start,
      },
      'episode_finished',
    );
    return result;
  });

  return app;
}

export async function startServer() {
  const app = buildApp();

  async function shutdown() {
    await app.close();
    await closeBrowser();
    process.exit(0);
  }

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
