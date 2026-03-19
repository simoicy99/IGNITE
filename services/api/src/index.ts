import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';

import authPlugin from './plugins/auth';
import geoGatePlugin from './plugins/geoGate';
import authRoutes from './routes/auth';
import feedRoutes from './routes/feed';
import walletRoutes from './routes/wallet';
import matchRoutes from './routes/matches';
import disputeRoutes from './routes/disputes';
import adminRoutes from './routes/admin';
import webhookRoutes from './routes/webhooks';

const PORT = parseInt(process.env.API_PORT ?? '3001');
const HOST = process.env.API_HOST ?? '0.0.0.0';

async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // ─── Core Plugins ───────────────────────────────────────────────────────────

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    },
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // ─── Custom Plugins ──────────────────────────────────────────────────────────

  await app.register(authPlugin);
  await app.register(geoGatePlugin);

  // ─── Routes ─────────────────────────────────────────────────────────────────

  await app.register(webhookRoutes); // No prefix - Stripe needs raw path
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(feedRoutes, { prefix: '/api/v1' });
  await app.register(walletRoutes, { prefix: '/api/v1' });
  await app.register(matchRoutes, { prefix: '/api/v1' });
  await app.register(disputeRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });

  // ─── Health Check ────────────────────────────────────────────────────────────

  app.get('/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    });
  });

  // ─── 404 Handler ─────────────────────────────────────────────────────────────

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: `Route ${request.method} ${request.url} not found`,
    });
  });

  // ─── Error Handler ────────────────────────────────────────────────────────────

  app.setErrorHandler((error, request, reply) => {
    app.log.error({ err: error, url: request.url, method: request.method }, 'Unhandled error');

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.message,
      });
    }

    return reply.status(500).send({
      success: false,
      error: 'Internal server error',
    });
  });

  return app;
}

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Ignite API listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

export { buildApp };
