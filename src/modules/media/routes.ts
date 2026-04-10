import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

export async function mediaRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/:mediaId',
    {
      schema: {
        tags: ['Media'],
        summary: 'Serve a stored media asset',
        params: z.object({
          mediaId: z.string().uuid()
        }),
        response: {
          200: z.any()
        }
      }
    },
    async (request, reply) => {
      const media = await prisma.mediaAsset.findUnique({
        where: {
          id: request.params.mediaId
        }
      });

      if (!media) {
        throw new AppError({
          statusCode: 404,
          code: 'MEDIA_NOT_FOUND',
          message: 'The requested media asset was not found.'
        });
      }

      reply.header('Content-Type', media.mimeType);
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(Buffer.from(media.content));
    }
  );
}
