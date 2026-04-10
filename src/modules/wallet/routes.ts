import { AssetKey, MilesPurchaseStatus, NotificationType } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { loadWalletActivities } from '../../lib/activity';
import { generateOpaqueToken } from '../../lib/auth';
import { AppError } from '../../lib/errors';
import { mapWallet } from '../../lib/mappers';
import { createNotification } from '../../lib/notifications';
import { prisma } from '../../lib/prisma';

interface MilesPackage {
  code: string;
  amountMiles: number;
  bonusMiles: number;
  amountMinor: number;
  currency: 'BRL';
}

const MILES_PACKAGES: MilesPackage[] = [
  { code: 'PKG_5K', amountMiles: 5000, bonusMiles: 0, amountMinor: 4990, currency: 'BRL' },
  { code: 'PKG_10K', amountMiles: 10000, bonusMiles: 500, amountMinor: 8990, currency: 'BRL' },
  { code: 'PKG_25K', amountMiles: 25000, bonusMiles: 2500, amountMinor: 19990, currency: 'BRL' },
  { code: 'PKG_50K', amountMiles: 50000, bonusMiles: 7500, amountMinor: 36990, currency: 'BRL' },
  { code: 'PKG_100K', amountMiles: 100000, bonusMiles: 20000, amountMinor: 64990, currency: 'BRL' }
];

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
  completedAt: z.string().nullable(),
  amountInMiles: z.number().int().optional(),
  sender: z
    .object({
      userId: z.string().uuid(),
      fullName: z.string(),
      email: z.string().email(),
      flexKey: z.string(),
      avatarUrl: z.string().nullable()
    })
    .nullable(),
  recipient: z
    .object({
      userId: z.string().uuid(),
      fullName: z.string(),
      email: z.string().email(),
      flexKey: z.string(),
      avatarUrl: z.string().nullable()
    })
    .nullable()
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

  typed.get(
    '/miles-packages',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Wallet'],
        summary: 'List available FlexMiles purchase packages',
        response: {
          200: z.object({
            items: z.array(
              z.object({
                code: z.string(),
                amountMiles: z.number().int(),
                bonusMiles: z.number().int(),
                totalMiles: z.number().int(),
                amountMinor: z.number().int(),
                currency: z.literal('BRL')
              })
            )
          })
        }
      }
    },
    async () => {
      return {
        items: MILES_PACKAGES.map((pkg) => ({
          code: pkg.code,
          amountMiles: pkg.amountMiles,
          bonusMiles: pkg.bonusMiles,
          totalMiles: pkg.amountMiles + pkg.bonusMiles,
          amountMinor: pkg.amountMinor,
          currency: pkg.currency
        }))
      };
    }
  );

  typed.post(
    '/miles-purchases',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Wallet'],
        summary: 'Purchase a FlexMiles package and credit the wallet',
        body: z.object({
          packageCode: z.string(),
          paymentMethod: z.enum(['CARD', 'PIX']).default('CARD')
        }),
        response: {
          201: z.object({
            id: z.string().uuid(),
            packageCode: z.string(),
            amountMiles: z.number().int(),
            bonusMiles: z.number().int(),
            totalMiles: z.number().int(),
            amountMinor: z.number().int(),
            currency: z.literal('BRL'),
            paymentMethod: z.string(),
            paymentRef: z.string(),
            status: z.literal('COMPLETED'),
            createdAt: z.string(),
            completedAt: z.string(),
            walletBalance: z.object({
              asset: z.literal('FLEX_MILES'),
              amount: z.number().int()
            })
          })
        }
      }
    },
    async (request, reply) => {
      const pkg = MILES_PACKAGES.find((entry) => entry.code === request.body.packageCode);

      if (!pkg) {
        throw new AppError({
          statusCode: 404,
          code: 'MILES_PACKAGE_NOT_FOUND',
          message: 'The requested FlexMiles package does not exist.'
        });
      }

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

      const totalMiles = pkg.amountMiles + pkg.bonusMiles;
      const paymentRef = `pay_${generateOpaqueToken(16)}`;
      const now = new Date();

      const result = await prisma.$transaction(async (tx) => {
        const purchase = await tx.milesPurchase.create({
          data: {
            userId: request.currentUser.userId,
            walletId: wallet.id,
            packageCode: pkg.code,
            amountMiles: pkg.amountMiles,
            bonusMiles: pkg.bonusMiles,
            totalMiles,
            amountMinor: pkg.amountMinor,
            currency: pkg.currency,
            paymentMethod: request.body.paymentMethod,
            paymentRef,
            status: MilesPurchaseStatus.COMPLETED,
            completedAt: now
          }
        });

        const flexBalance = await tx.walletBalance.upsert({
          where: {
            walletId_asset: {
              walletId: wallet.id,
              asset: AssetKey.FLEX_MILES
            }
          },
          update: {
            amount: {
              increment: totalMiles
            }
          },
          create: {
            walletId: wallet.id,
            asset: AssetKey.FLEX_MILES,
            amount: totalMiles
          }
        });

        return { purchase, flexBalance };
      });

      await createNotification(prisma, {
        userId: request.currentUser.userId,
        type: NotificationType.BILLING,
        title: 'Compra de FlexMiles concluida',
        body: `Voce comprou ${pkg.amountMiles.toLocaleString('pt-BR')} FlexMiles${pkg.bonusMiles > 0 ? ` + ${pkg.bonusMiles.toLocaleString('pt-BR')} bonus` : ''}.`,
        actionUrl: '/transactions'
      });

      reply.status(201);
      return {
        id: result.purchase.id,
        packageCode: result.purchase.packageCode,
        amountMiles: result.purchase.amountMiles,
        bonusMiles: result.purchase.bonusMiles,
        totalMiles: result.purchase.totalMiles,
        amountMinor: result.purchase.amountMinor,
        currency: 'BRL' as const,
        paymentMethod: result.purchase.paymentMethod,
        paymentRef: result.purchase.paymentRef,
        status: 'COMPLETED' as const,
        createdAt: result.purchase.createdAt.toISOString(),
        completedAt: now.toISOString(),
        walletBalance: {
          asset: 'FLEX_MILES' as const,
          amount: result.flexBalance.amount
        }
      };
    }
  );

  typed.get(
    '/miles-purchases',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Wallet'],
        summary: 'List FlexMiles purchases for the authenticated user',
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          pageSize: z.coerce.number().int().positive().max(50).default(10)
        }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string().uuid(),
                packageCode: z.string(),
                amountMiles: z.number().int(),
                bonusMiles: z.number().int(),
                totalMiles: z.number().int(),
                amountMinor: z.number().int(),
                currency: z.string(),
                paymentMethod: z.string(),
                paymentRef: z.string(),
                status: z.string(),
                createdAt: z.string(),
                completedAt: z.string().nullable()
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
        prisma.milesPurchase.findMany({
          where: {
            userId: request.currentUser.userId
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: (request.query.page - 1) * request.query.pageSize,
          take: request.query.pageSize
        }),
        prisma.milesPurchase.count({
          where: {
            userId: request.currentUser.userId
          }
        })
      ]);

      return {
        items: items.map((item) => ({
          id: item.id,
          packageCode: item.packageCode,
          amountMiles: item.amountMiles,
          bonusMiles: item.bonusMiles,
          totalMiles: item.totalMiles,
          amountMinor: item.amountMinor,
          currency: item.currency,
          paymentMethod: item.paymentMethod,
          paymentRef: item.paymentRef,
          status: item.status,
          createdAt: item.createdAt.toISOString(),
          completedAt: item.completedAt ? item.completedAt.toISOString() : null
        })),
        page: request.query.page,
        pageSize: request.query.pageSize,
        totalItems,
        totalPages: Math.max(Math.ceil(totalItems / request.query.pageSize), 1)
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
