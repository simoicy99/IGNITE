import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { ALLOWED_STATES } from '@ignite/shared';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface GeoPayload {
  latitude: number;
  longitude: number;
  state: string;
}

/**
 * Validates that the user's geographic location is in an allowed state.
 * Requires:
 *   - request.body.geo OR request headers x-geo-state / x-geo-lat / x-geo-lng
 *   - User must be authenticated (userId on request)
 * Updates user.lastGeoState and user.lastGeoAt on success.
 */
export async function geoGateHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Extract geo from body or headers
  let geo: GeoPayload | null = null;

  const body = request.body as Record<string, any> | null;
  if (body?.geo) {
    geo = body.geo as GeoPayload;
  } else {
    // Try headers fallback
    const state = request.headers['x-geo-state'] as string | undefined;
    const latStr = request.headers['x-geo-lat'] as string | undefined;
    const lngStr = request.headers['x-geo-lng'] as string | undefined;
    if (state && latStr && lngStr) {
      geo = {
        state,
        latitude: parseFloat(latStr),
        longitude: parseFloat(lngStr),
      };
    }
  }

  if (!geo) {
    reply.status(400).send({
      success: false,
      error: 'GPS location required. Provide geo: { latitude, longitude, state } in request body.',
    });
    return;
  }

  const { state, latitude, longitude } = geo;

  // Validate state is allowed
  if (!(ALLOWED_STATES as readonly string[]).includes(state)) {
    reply.status(403).send({
      success: false,
      error: `Location not allowed. Ignite is only available in: ${ALLOWED_STATES.join(', ')}`,
    });
    return;
  }

  // Validate coordinates are plausible
  if (isNaN(latitude) || isNaN(longitude)) {
    reply.status(400).send({
      success: false,
      error: 'Invalid GPS coordinates',
    });
    return;
  }

  // Update user's last known geo
  try {
    await prisma.user.update({
      where: { id: request.userId },
      data: {
        lastGeoState: state,
        lastGeoAt: new Date(),
      },
    });
  } catch (err) {
    // Non-fatal - log but don't block
    request.log.warn({ err }, 'Failed to update user geo state');
  }
}

const geoGatePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'geoGate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      await geoGateHook(request, reply);
    }
  );
};

declare module 'fastify' {
  interface FastifyInstance {
    geoGate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(geoGatePlugin, { name: 'geoGate' });
