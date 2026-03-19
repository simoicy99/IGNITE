import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { CreateChallengePostSchema, CreateSocialPostSchema, CreateCommentSchema } from '@ignite/shared';
import { lockFunds } from '@ignite/ledger';
import { getAllBalances } from '@ignite/ledger';

const prisma = new PrismaClient();

const feedRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /feed
   * Get paginated feed of posts
   */
  fastify.get(
    '/feed',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const query = request.query as { cursor?: string; limit?: string; type?: string };
      const limit = Math.min(parseInt(query.limit ?? '20'), 100);
      const type = query.type as 'CHALLENGE' | 'SOCIAL' | undefined;

      const posts = await prisma.post.findMany({
        take: limit + 1,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        where: type ? { type } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, handle: true, chessUsername: true, psnTag: true, xboxTag: true, createdAt: true },
          },
          match: {
            select: {
              id: true,
              game: true,
              stakeCents: true,
              status: true,
              createdAt: true,
              creator: { select: { id: true, handle: true } },
              accepter: { select: { id: true, handle: true } },
            },
          },
          _count: { select: { comments: true } },
        },
      });

      const hasMore = posts.length > limit;
      const items = posts.slice(0, limit);
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return reply.send({
        success: true,
        data: {
          items: items.map((p) => ({
            id: p.id,
            type: p.type,
            body: p.body,
            mediaUrl: p.mediaUrl,
            user: p.user,
            match: p.match,
            commentCount: p._count.comments,
            createdAt: p.createdAt,
          })),
          nextCursor,
        },
      });
    }
  );

  /**
   * POST /feed/challenge
   * Create a challenge post (creates match + post)
   * Requires geo gate + sufficient funds
   */
  fastify.post(
    '/feed/challenge',
    { preHandler: [fastify.authenticate, fastify.geoGate] },
    async (request, reply) => {
      const result = CreateChallengePostSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const { game, templateId, stakeCents, platform, body } = result.data;

      // Validate NBA2K requires platform
      if (game === 'NBA2K' && !platform) {
        return reply.status(400).send({
          success: false,
          error: 'Platform (PS5 or XBOX) is required for NBA 2K matches',
        });
      }

      // Validate template exists
      const template = await prisma.matchTemplate.findUnique({ where: { id: templateId } });
      if (!template || !template.isActive) {
        return reply.status(404).send({ success: false, error: 'Match template not found' });
      }

      if (template.game !== game) {
        return reply.status(400).send({ success: false, error: 'Template game mismatch' });
      }

      // Check balance
      const balances = await getAllBalances(request.userId);
      if (balances.available < stakeCents) {
        return reply.status(400).send({
          success: false,
          error: `Insufficient funds. Available: $${(balances.available / 100).toFixed(2)}, Required: $${(stakeCents / 100).toFixed(2)}`,
        });
      }

      // Create match + post in transaction
      const match = await prisma.match.create({
        data: {
          game,
          templateId,
          stakeCents,
          status: 'CREATED',
          creatorId: request.userId,
          platform: platform ?? null,
        },
      });

      const post = await prisma.post.create({
        data: {
          userId: request.userId,
          type: 'CHALLENGE',
          body: body ?? `I'm looking for a ${game === 'CHESS' ? 'chess' : 'NBA 2K'} opponent! Stake: $${(stakeCents / 100).toFixed(2)}`,
          matchId: match.id,
        },
        include: {
          user: { select: { id: true, handle: true } },
          match: {
            select: {
              id: true,
              game: true,
              stakeCents: true,
              status: true,
              platform: true,
              creator: { select: { id: true, handle: true } },
            },
          },
        },
      });

      // Lock funds immediately
      await lockFunds(
        request.userId,
        stakeCents,
        match.id,
        `lock:${match.id}:creator`
      );

      // Update match status to FUNDED
      await prisma.match.update({
        where: { id: match.id },
        data: { status: 'FUNDED' },
      });

      return reply.status(201).send({
        success: true,
        data: {
          post: {
            id: post.id,
            type: post.type,
            body: post.body,
            user: post.user,
            match: post.match,
            createdAt: post.createdAt,
          },
        },
      });
    }
  );

  /**
   * POST /feed/social
   * Create a social post
   */
  fastify.post(
    '/feed/social',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const result = CreateSocialPostSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const { body, mediaUrl } = result.data;

      const post = await prisma.post.create({
        data: {
          userId: request.userId,
          type: 'SOCIAL',
          body,
          mediaUrl: mediaUrl ?? null,
        },
        include: {
          user: { select: { id: true, handle: true } },
        },
      });

      return reply.status(201).send({
        success: true,
        data: {
          post: {
            id: post.id,
            type: post.type,
            body: post.body,
            mediaUrl: post.mediaUrl,
            user: post.user,
            createdAt: post.createdAt,
          },
        },
      });
    }
  );

  /**
   * GET /feed/:postId
   * Get a single post
   */
  fastify.get(
    '/feed/:postId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { postId } = request.params as { postId: string };

      const post = await prisma.post.findUnique({
        where: { id: postId },
        include: {
          user: { select: { id: true, handle: true } },
          match: {
            include: {
              template: true,
              creator: { select: { id: true, handle: true } },
              accepter: { select: { id: true, handle: true } },
            },
          },
          _count: { select: { comments: true } },
        },
      });

      if (!post) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      return reply.send({
        success: true,
        data: {
          id: post.id,
          type: post.type,
          body: post.body,
          mediaUrl: post.mediaUrl,
          user: post.user,
          match: post.match,
          commentCount: post._count.comments,
          createdAt: post.createdAt,
        },
      });
    }
  );

  /**
   * GET /feed/:postId/comments
   * Get comments for a post
   */
  fastify.get(
    '/feed/:postId/comments',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { postId } = request.params as { postId: string };
      const query = request.query as { cursor?: string; limit?: string };
      const limit = Math.min(parseInt(query.limit ?? '20'), 100);

      const comments = await prisma.comment.findMany({
        where: { postId },
        take: limit + 1,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, handle: true } },
        },
      });

      const hasMore = comments.length > limit;
      const items = comments.slice(0, limit);
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return reply.send({
        success: true,
        data: { items, nextCursor },
      });
    }
  );

  /**
   * POST /feed/:postId/comments
   * Add a comment to a post
   */
  fastify.post(
    '/feed/:postId/comments',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { postId } = request.params as { postId: string };
      const result = CreateCommentSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const post = await prisma.post.findUnique({ where: { id: postId } });
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      const comment = await prisma.comment.create({
        data: {
          postId,
          userId: request.userId,
          body: result.data.body,
        },
        include: {
          user: { select: { id: true, handle: true } },
        },
      });

      return reply.status(201).send({
        success: true,
        data: comment,
      });
    }
  );
};

export default feedRoutes;
