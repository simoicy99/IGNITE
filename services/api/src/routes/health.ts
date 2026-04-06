import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { 
  maxRetriesPerRequest: null 
});

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /health
   * Public health check endpoint
   */
  fastify.get('/health', async (request, reply) => {
    const checks: Record<string, 'healthy' | 'unhealthy'> = {};
    let statusCode = 200;

    // Check database
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'healthy';
    } catch (err) {
      checks.database = 'unhealthy';
      statusCode = 503;
    }

    // Check Redis
    try {
      await redis.ping();
      checks.redis = 'healthy';
    } catch (err) {
      checks.redis = 'unhealthy';
      statusCode = 503;
    }

    const allHealthy = Object.values(checks).every((v) => v === 'healthy');

    return reply.status(statusCode).send({
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  /**
   * GET /health/detailed
   * Detailed health check with stats (admin only)
   */
  fastify.get('/health/detailed', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const [
      dbHealth,
      redisHealth,
      queueStats,
      recentMatches,
      pendingDisputes,
    ] = await Promise.all([
      // DB check
      prisma.$queryRaw`SELECT 1`.then(() => 'healthy').catch(() => 'unhealthy'),
      // Redis check
      redis.ping().then(() => 'healthy').catch(() => 'unhealthy'),
      // Queue stats (approximate)
      Promise.resolve({
        chessVerify: 'unknown',
        disputeTimeout: 'unknown',
        noShowTimeout: 'unknown',
      }),
      // Recent match stats
      prisma.match.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      // Pending disputes
      prisma.dispute.count({ where: { status: 'OPEN' } }),
    ]);

    return reply.send({
      status: dbHealth === 'healthy' && redisHealth === 'healthy' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealth,
        redis: redisHealth,
        queues: queueStats,
      },
      stats: {
        matchesLast24h: recentMatches,
        pendingDisputes,
      },
    });
  });
};

export default healthRoutes;
