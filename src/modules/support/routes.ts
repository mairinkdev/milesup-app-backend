import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { mapSupportMessage } from '../../lib/mappers';
import { prisma } from '../../lib/prisma';

export async function supportRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/faqs',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Support'],
        summary: 'List support FAQs',
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string().uuid(),
                question: z.string(),
                answer: z.string(),
                category: z.string(),
                sortOrder: z.number().int()
              })
            )
          })
        }
      }
    },
    async () => {
      const faqs = await prisma.supportFaq.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
      });

      return {
        items: faqs.map((faq) => ({
          id: faq.id,
          question: faq.question,
          answer: faq.answer,
          category: faq.category,
          sortOrder: faq.sortOrder
        }))
      };
    }
  );

  typed.get(
    '/conversation',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Support'],
        summary: 'Get or create the support conversation',
        response: {
          200: z.object({
            id: z.string().uuid(),
            status: z.string(),
            messages: z.array(
              z.object({
                id: z.string().uuid(),
                authorType: z.string(),
                authorName: z.string(),
                body: z.string(),
                createdAt: z.string()
              })
            )
          })
        }
      }
    },
    async (request) => {
      const conversation =
        (await prisma.supportConversation.findUnique({
          where: {
            userId: request.currentUser.userId
          },
          include: {
            messages: {
              orderBy: {
                createdAt: 'asc'
              }
            }
          }
        })) ??
        (await prisma.supportConversation.create({
          data: {
            userId: request.currentUser.userId,
            messages: {
              create: {
                authorType: 'AGENT',
                authorName: 'MilesUp Support',
                body: 'Hello! We are here to help with transfers, conversions, subscriptions and account access.'
              }
            }
          },
          include: {
            messages: {
              orderBy: {
                createdAt: 'asc'
              }
            }
          }
        }));

      return {
        id: conversation.id,
        status: conversation.status,
        messages: conversation.messages.map(mapSupportMessage)
      };
    }
  );

  typed.post(
    '/conversation/messages',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Support'],
        summary: 'Send a message to support',
        body: z.object({
          message: z.string().min(2).max(1000)
        }),
        response: {
          201: z.object({
            conversationId: z.string().uuid(),
            messages: z.array(
              z.object({
                id: z.string().uuid(),
                authorType: z.string(),
                authorName: z.string(),
                body: z.string(),
                createdAt: z.string()
              })
            )
          })
        }
      }
    },
    async (request, reply) => {
      const conversation =
        (await prisma.supportConversation.findUnique({
          where: {
            userId: request.currentUser.userId
          }
        })) ??
        (await prisma.supportConversation.create({
          data: {
            userId: request.currentUser.userId
          }
        }));

      await prisma.supportMessage.createMany({
        data: [
          {
            conversationId: conversation.id,
            authorType: 'USER',
            authorName: 'You',
            body: request.body.message
          },
          {
            conversationId: conversation.id,
            authorType: 'AGENT',
            authorName: 'MilesUp Support',
            body: 'Thanks for the message. We have received it and will keep the conversation here updated.'
          }
        ]
      });

      const messages = await prisma.supportMessage.findMany({
        where: {
          conversationId: conversation.id
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      reply.status(201);
      return {
        conversationId: conversation.id,
        messages: messages.map(mapSupportMessage)
      };
    }
  );
}
