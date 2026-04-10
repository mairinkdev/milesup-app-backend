import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { buildPagination } from '../../lib/formatters';
import { mapNotification } from '../../lib/mappers';
import { prisma } from '../../lib/prisma';

export async function notificationRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Notifications'],
        summary: 'List notifications for the authenticated user',
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          pageSize: z.coerce.number().int().positive().max(50).default(20)
        }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string().uuid(),
                type: z.string(),
                title: z.string(),
                body: z.string(),
                actionUrl: z.string().nullable(),
                status: z.string(),
                createdAt: z.string(),
                readAt: z.string().nullable()
              })
            ),
            page: z.number().int(),
            pageSize: z.number().int(),
            totalItems: z.number().int(),
            totalPages: z.number().int()
          })
        }
      }
    },
    async (request) => {
      const [items, totalItems] = await Promise.all([
        prisma.notification.findMany({
          where: {
            userId: request.currentUser.userId
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: (request.query.page - 1) * request.query.pageSize,
          take: request.query.pageSize
        }),
        prisma.notification.count({
          where: {
            userId: request.currentUser.userId
          }
        })
      ]);

      return {
        items: items.map(mapNotification),
        ...buildPagination(request.query.page, request.query.pageSize, totalItems)
      };
    }
  );

  typed.post(
    '/read-all',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        response: {
          200: z.object({
            updatedCount: z.number().int()
          })
        }
      }
    },
    async (request) => {
      const result = await prisma.notification.updateMany({
        where: {
          userId: request.currentUser.userId,
          status: 'UNREAD'
        },
        data: {
          status: 'READ',
          readAt: new Date()
        }
      });

      return {
        updatedCount: result.count
      };
    }
  );
}
