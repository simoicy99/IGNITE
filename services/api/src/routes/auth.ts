import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { RegisterSchema, LoginSchema } from '@ignite/shared';

const prisma = new PrismaClient();

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /auth/register
   * Register a new user (email must be on allowlist)
   */
  fastify.post('/auth/register', async (request, reply) => {
    const result = RegisterSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: result.error.flatten(),
      });
    }

    const { email, handle, password, geo } = result.data;

    // Check allowlist
    const allowlisted = await prisma.allowlistEmail.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!allowlisted) {
      return reply.status(403).send({
        success: false,
        error: 'Email is not on the invite list. Ignite is currently invite-only.',
      });
    }

    // Check email uniqueness
    const existingEmail = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existingEmail) {
      return reply.status(409).send({
        success: false,
        error: 'An account with this email already exists',
      });
    }

    // Check handle uniqueness
    const existingHandle = await prisma.user.findUnique({
      where: { handle: handle.toLowerCase() },
    });
    if (existingHandle) {
      return reply.status(409).send({
        success: false,
        error: 'This handle is already taken',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        handle: handle.toLowerCase(),
        passwordHash,
        lastGeoState: geo.state,
        lastGeoAt: new Date(),
        isAdmin: email.toLowerCase() === 'admin@ignite.gg',
      },
    });

    // Create wallet accounts
    await prisma.walletAccount.createMany({
      data: [
        { userId: user.id, type: 'AVAILABLE' },
        { userId: user.id, type: 'LOCKED' },
        { userId: user.id, type: 'PENDING' },
      ],
    });

    // Generate JWT
    const token = fastify.jwt.sign({
      userId: user.id,
      email: user.email,
      handle: user.handle,
      isAdmin: user.isAdmin,
    });

    return reply.status(201).send({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          handle: user.handle,
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
        },
      },
    });
  });

  /**
   * POST /auth/login
   * Login with email and password
   */
  fastify.post('/auth/login', async (request, reply) => {
    const result = LoginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: result.error.flatten(),
      });
    }

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }

    if (!user.passwordHash) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }

    const token = fastify.jwt.sign({
      userId: user.id,
      email: user.email,
      handle: user.handle,
      isAdmin: user.isAdmin,
    });

    return reply.send({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          handle: user.handle,
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
        },
      },
    });
  });

  /**
   * GET /auth/me
   * Get current user profile
   */
  fastify.get(
    '/auth/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
      });

      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }

      return reply.send({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          handle: user.handle,
          handleChangedCount: user.handleChangedCount,
          chessUsername: user.chessUsername,
          psnTag: user.psnTag,
          xboxTag: user.xboxTag,
          lastGeoState: user.lastGeoState,
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
        },
      });
    }
  );

  /**
   * PATCH /auth/profile
   * Update profile (chess username, PSN/Xbox tags)
   */
  fastify.patch(
    '/auth/profile',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { UpdateProfileSchema } = await import('@ignite/shared');
      const result = UpdateProfileSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const user = await prisma.user.update({
        where: { id: request.userId },
        data: result.data,
      });

      return reply.send({
        success: true,
        data: {
          id: user.id,
          handle: user.handle,
          chessUsername: user.chessUsername,
          psnTag: user.psnTag,
          xboxTag: user.xboxTag,
        },
      });
    }
  );

  /**
   * PATCH /auth/handle
   * Update handle (only once allowed)
   */
  fastify.patch(
    '/auth/handle',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { UpdateHandleSchema } = await import('@ignite/shared');
      const result = UpdateHandleSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: result.error.flatten(),
        });
      }

      const { handle } = result.data;

      const user = await prisma.user.findUnique({ where: { id: request.userId } });
      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }

      if (user.handleChangedCount >= 1) {
        return reply.status(400).send({
          success: false,
          error: 'Handle can only be changed once',
        });
      }

      // Check new handle uniqueness
      const existing = await prisma.user.findUnique({
        where: { handle: handle.toLowerCase() },
      });
      if (existing && existing.id !== user.id) {
        return reply.status(409).send({
          success: false,
          error: 'This handle is already taken',
        });
      }

      // Update handle atomically
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            handle: handle.toLowerCase(),
            handleChangedCount: { increment: 1 },
          },
        }),
        prisma.handleHistory.create({
          data: {
            userId: user.id,
            oldHandle: user.handle,
            newHandle: handle.toLowerCase(),
          },
        }),
      ]);

      return reply.send({
        success: true,
        data: { handle: handle.toLowerCase() },
        message: 'Handle updated. Note: this can only be done once.',
      });
    }
  );
};

export default authRoutes;
