import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
    userHandle: string;
    isAdmin: boolean;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Add authenticate decorator
  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
        const payload = request.user as {
          userId: string;
          email: string;
          handle: string;
          isAdmin: boolean;
        };
        request.userId = payload.userId;
        request.userEmail = payload.email;
        request.userHandle = payload.handle;
        request.isAdmin = payload.isAdmin ?? false;
      } catch (err) {
        reply.status(401).send({ success: false, error: 'Unauthorized' });
      }
    }
  );

  // Add admin-only authenticate decorator
  fastify.decorate(
    'authenticateAdmin',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
        const payload = request.user as {
          userId: string;
          email: string;
          handle: string;
          isAdmin: boolean;
        };
        if (!payload.isAdmin) {
          reply.status(403).send({ success: false, error: 'Forbidden: Admin access required' });
          return;
        }
        request.userId = payload.userId;
        request.userEmail = payload.email;
        request.userHandle = payload.handle;
        request.isAdmin = payload.isAdmin;
      } catch (err) {
        reply.status(401).send({ success: false, error: 'Unauthorized' });
      }
    }
  );
};

// Extend FastifyInstance typings
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(authPlugin, { name: 'auth' });
