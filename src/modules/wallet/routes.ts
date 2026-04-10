import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { loadWalletActivities } from '../../lib/activity';
import { AppError } from '../../lib/errors';
import { mapWallet } from '../../lib/mappers';
import { prisma } from '../../lib/prisma';

const activitySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['TRANSFER', 'CONVERSION']),
  title: z.string(),
  direction: z.enum(['INCOMING', 'OUTGOING']),
  status: z.string(),
  amountMiles: z.number().int(),
  feeMiles: z.number().int(),
  asset: z.string(),
  note: z.string().nullable().optional(),
  createdAt: z.string(),
  amountInMiles: z.number().int().optional()
});

const walletSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal('PERSONAL'),
  securityModeActive: z.boolean(),
  balances: z.array(
    z.object({
      asset: z.string(),
      amount: z.number().int()
    })
  ),
  createdAt: z.string(),
  updatedAt: z.string()
});

export async function walletRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Wallet'],
        summary: 'Get wallet summary',
        response: {
          200: walletSchema.extend({
            totalMiles: z.number().int()
          })
        }
      }
    },
    async (request) => {
      const wallet = await prisma.wallet.findUnique({
        where: {
          userId: request.currentUser.userId
        },
        include: {
          balances: {
            orderBy: {
              asset: 'asc'
            }
          }
        }
      });

      if (!wallet) {
        throw new AppError({
          statusCode: 404,
          code: 'WALLET_NOT_FOUND',
          message: 'The user wallet was not found.'
        });
      }

      return {
        ...mapWallet(wallet, wallet.balances),
        totalMiles: wallet.balances.reduce((sum, balance) => sum + balance.amount, 0)
      };
    }
  );

  typed.get(
    '/activities',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Wallet'],
        summary: 'Get wallet activities',
        querystring: z.object({
          period: z.enum(['7d', '15d', '30d', '90d']).default('30d'),
          kind: z.enum(['ALL', 'TRANSFERS', 'CONVERSIONS']).default('ALL'),
          direction: z.enum(['ALL', 'INCOMING', 'OUTGOING']).default('ALL'),
          page: z.coerce.number().int().positive().default(1),
          pageSize: z.coerce.number().int().positive().max(100).default(20)
        }),
        response: {
          200: z.object({
            items: z.array(activitySchema),
            summary: z.object({
              transfersCount: z.number().int(),
              totalSentMiles: z.number().int(),
              totalReceivedMiles: z.number().int(),
              conversionsCount: z.number().int(),
              totalConvertedMiles: z.number().int(),
              period: z.object({
                from: z.string(),
                to: z.string()
              })
            }),
            page: z.number().int(),
            pageSize: z.number().int(),
            totalItems: z.number().int(),
            totalPages: z.number().int()
          })
        }
      }
    },
    async (request) => {
      return loadWalletActivities(prisma, {
        userId: request.currentUser.userId,
        period: request.query.period,
        kind: request.query.kind,
        direction: request.query.direction,
        page: request.query.page,
        pageSize: request.query.pageSize
      });
    }
  );

  typed.post(
    '/security-mode',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Wallet'],
        summary: 'Enable wallet security mode',
        body: z.object({
          reason: z.string().max(300).optional()
        }),
        response: {
          200: z.object({
            active: z.boolean(),
            startedAt: z.string(),
            reason: z.string().nullable()
          })
        }
      }
    },
    async (request) => {
      const wallet = await prisma.wallet.findUnique({
        where: {
          userId: request.currentUser.userId
        }
      });

      if (!wallet) {
        throw new AppError({
          statusCode: 404,
          code: 'WALLET_NOT_FOUND',
          message: 'The user wallet was not found.'
        });
      }

      const session = await prisma.securityModeSession.create({
        data: {
          userId: request.currentUser.userId,
          walletId: wallet.id,
          reason: request.body.reason
        }
      });

      await prisma.wallet.update({
        where: {
          id: wallet.id
        },
        data: {
          securityModeActive: true
        }
      });

      return {
        active: true,
        startedAt: session.startedAt.toISOString(),
        reason: session.reason ?? null
      };
    }
  );

  typed.delete(
    '/security-mode',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Wallet'],
        summary: 'Disable wallet security mode',
        response: {
          200: z.object({
            active: z.boolean(),
            endedAt: z.string()
          })
        }
      }
    },
    async (request) => {
      const wallet = await prisma.wallet.findUnique({
        where: {
          userId: request.currentUser.userId
        }
      });

      if (!wallet) {
        throw new AppError({
          statusCode: 404,
          code: 'WALLET_NOT_FOUND',
          message: 'The user wallet was not found.'
        });
      }

      await prisma.securityModeSession.updateMany({
        where: {
          walletId: wallet.id,
          endedAt: null
        },
        data: {
          endedAt: new Date()
        }
      });

      await prisma.wallet.update({
        where: {
          id: wallet.id
        },
        data: {
          securityModeActive: false
        }
      });

      return {
        active: false,
        endedAt: new Date().toISOString()
      };
    }
  );
}
