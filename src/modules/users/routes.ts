import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { mapUser } from '../../lib/mappers';
import { prisma } from '../../lib/prisma';

const userSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  cpf: z.string().nullable(),
  cnpj: z.string().nullable(),
  birthDate: z.string().nullable(),
  role: z.enum(['USER', 'COMPANY']),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']),
  flexKey: z.string(),
  companyName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export async function userRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/me',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Users'],
        summary: 'Get the authenticated user profile',
        response: {
          200: userSchema
        }
      }
    },
    async (request) => {
      const user = await prisma.user.findUnique({
        where: {
          id: request.currentUser.userId
        }
      });

      if (!user) {
        throw new AppError({
          statusCode: 404,
          code: 'USER_NOT_FOUND',
          message: 'The authenticated user was not found.'
        });
      }

      return mapUser(user, env.APP_BASE_URL);
    }
  );

  typed.patch(
    '/me',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Users'],
        summary: 'Update the authenticated user profile',
        body: z.object({
          fullName: z.string().min(3).optional(),
          phone: z.string().min(8).optional(),
          companyName: z.string().min(2).optional()
        }),
        response: {
          200: userSchema
        }
      }
    },
    async (request) => {
      const user = await prisma.user.update({
        where: {
          id: request.currentUser.userId
        },
        data: {
          name: request.body.fullName,
          phone: request.body.phone,
          companyName: request.body.companyName
        }
      });

      return mapUser(user, env.APP_BASE_URL);
    }
  );

  typed.post(
    '/me/avatar',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Users'],
        summary: 'Upload the authenticated user avatar',
        consumes: ['multipart/form-data'],
        response: {
          200: userSchema
        }
      }
    },
    async (request) => {
      const file = await request.file();

      if (!file) {
        throw new AppError({
          statusCode: 400,
          code: 'FILE_REQUIRED',
          message: 'A file must be provided for the avatar upload.'
        });
      }

      const buffer = await file.toBuffer();

      const media = await prisma.mediaAsset.create({
        data: {
          userId: request.currentUser.userId,
          kind: 'AVATAR',
          fileName: file.filename,
          mimeType: file.mimetype,
          sizeBytes: buffer.byteLength,
          content: Uint8Array.from(buffer)
        }
      });

      const user = await prisma.user.update({
        where: {
          id: request.currentUser.userId
        },
        data: {
          profilePhotoAssetId: media.id
        }
      });

      return mapUser(user, env.APP_BASE_URL);
    }
  );
}
