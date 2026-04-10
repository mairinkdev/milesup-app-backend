import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { verifySecret } from '../../lib/auth';
import { createNotification } from '../../lib/notifications';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

export async function conversionRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/intents',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Conversions'],
        summary: 'Create a conversion intent from a connected provider to FlexMiles',
        body: z.object({
          providerConnectionId: z.string().uuid(),
          amountMiles: z.number().int().min(1000),
          note: z.string().max(280).optional()
        }),
        response: {
          201: z.object({
            id: z.string().uuid(),
            providerConnectionId: z.string().uuid(),
            providerKey: z.string(),
            amountInMiles: z.number().int(),
            amountOutMiles: z.number().int(),
            feeMiles: z.number().int(),
            rate: z.number(),
            expiresAt: z.string(),
            note: z.string().nullable()
          })
        }
      }
    },
    async (request, reply) => {
      const [wallet, connection] = await Promise.all([
        prisma.wallet.findUnique({
          where: {
            userId: request.currentUser.userId
          },
          include: {
            balances: true
          }
        }),
        prisma.providerConnection.findFirst({
          where: {
            id: request.body.providerConnectionId,
            userId: request.currentUser.userId,
            status: 'CONNECTED'
          },
          include: {
            provider: true
          }
        })
      ]);

      if (!wallet || !connection) {
        throw new AppError({
          statusCode: 404,
          code: 'CONVERSION_SOURCE_NOT_FOUND',
          message: 'The conversion source could not be found.'
        });
      }

      const sourceBalance = wallet.balances.find(
        (balance) => balance.asset === connection.provider.primaryAsset
      );

      if (!sourceBalance || sourceBalance.amount < request.body.amountMiles) {
        throw new AppError({
          statusCode: 400,
          code: 'INSUFFICIENT_PROVIDER_BALANCE',
          message: 'There is not enough provider balance to complete this conversion.'
        });
      }

      const rate = Number(connection.provider.providerToFlexRate);
      const grossOut = Math.floor(request.body.amountMiles * rate);
      const feeMiles = Math.floor(grossOut * (connection.provider.providerToFlexFeeBps / 10000));
      const amountOutMiles = Math.max(grossOut - feeMiles, 0);

      const intent = await prisma.conversionIntent.create({
        data: {
          userId: request.currentUser.userId,
          walletId: wallet.id,
          providerKey: connection.providerKey,
          providerConnectionId: connection.id,
          fromAsset: connection.provider.primaryAsset,
          toAsset: 'FLEX_MILES',
          amountInMiles: request.body.amountMiles,
          amountOutMiles,
          feeMiles,
          rate,
          note: request.body.note,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }
      });

      reply.status(201);
      return {
        id: intent.id,
        providerConnectionId: connection.id,
        providerKey: connection.providerKey,
        amountInMiles: intent.amountInMiles,
        amountOutMiles: intent.amountOutMiles,
        feeMiles: intent.feeMiles,
        rate,
        expiresAt: intent.expiresAt.toISOString(),
        note: intent.note
      };
    }
  );

  typed.post(
    '/intents/:intentId/confirm',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Conversions'],
        summary: 'Confirm a conversion intent with the wallet PIN',
        params: z.object({
          intentId: z.string().uuid()
        }),
        body: z.object({
          pinCode: z.string().length(6)
        }),
        response: {
          200: z.object({
            conversion: z.object({
              id: z.string().uuid(),
              providerKey: z.string(),
              amountInMiles: z.number().int(),
              amountOutMiles: z.number().int(),
              status: z.literal('COMPLETED'),
              createdAt: z.string()
            }),
            walletBalance: z.object({
              asset: z.literal('FLEX_MILES'),
              amount: z.number().int()
            })
          })
        }
      }
    },
    async (request) => {
      const [user, intent] = await Promise.all([
        prisma.user.findUnique({
          where: {
            id: request.currentUser.userId
          }
        }),
        prisma.conversionIntent.findFirst({
          where: {
            id: request.params.intentId,
            userId: request.currentUser.userId
          },
          include: {
            provider: true
          }
        })
      ]);

      if (!user || !intent) {
        throw new AppError({
          statusCode: 404,
          code: 'CONVERSION_INTENT_NOT_FOUND',
          message: 'The conversion intent was not found.'
        });
      }

      if (intent.expiresAt < new Date()) {
        throw new AppError({
          statusCode: 410,
          code: 'CONVERSION_INTENT_EXPIRED',
          message: 'The conversion intent has expired.'
        });
      }

      const validPin = await verifySecret(request.body.pinCode, user.transactionPinHash);

      if (!validPin) {
        throw new AppError({
          statusCode: 400,
          code: 'INVALID_PIN',
          message: 'The provided PIN is invalid.'
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({
          where: {
            id: intent.walletId
          },
          include: {
            balances: true
          }
        });

        if (!wallet) {
          throw new AppError({
            statusCode: 404,
            code: 'WALLET_NOT_FOUND',
            message: 'The wallet was not found for this conversion.'
          });
        }

        const sourceBalance = wallet.balances.find((balance) => balance.asset === intent.fromAsset);
        const flexBalance = wallet.balances.find((balance) => balance.asset === 'FLEX_MILES');

        if (!sourceBalance || sourceBalance.amount < intent.amountInMiles) {
          throw new AppError({
            statusCode: 400,
            code: 'INSUFFICIENT_PROVIDER_BALANCE',
            message: 'There is not enough provider balance to complete this conversion.'
          });
        }

        await tx.walletBalance.update({
          where: {
            id: sourceBalance.id
          },
          data: {
            amount: {
              decrement: intent.amountInMiles
            }
          }
        });

        if (flexBalance) {
          await tx.walletBalance.update({
            where: {
              id: flexBalance.id
            },
            data: {
              amount: {
                increment: intent.amountOutMiles
              }
            }
          });
        } else {
          await tx.walletBalance.create({
            data: {
              walletId: wallet.id,
              asset: 'FLEX_MILES',
              amount: intent.amountOutMiles
            }
          });
        }

        const conversion = await tx.conversion.create({
          data: {
            userId: intent.userId,
            walletId: intent.walletId,
            providerKey: intent.providerKey,
            providerConnectionId: intent.providerConnectionId,
            fromAsset: intent.fromAsset,
            toAsset: intent.toAsset,
            amountInMiles: intent.amountInMiles,
            amountOutMiles: intent.amountOutMiles,
            feeMiles: intent.feeMiles,
            rate: intent.rate,
            note: intent.note,
            usedSecurityMode: wallet.securityModeActive,
            completedAt: new Date()
          }
        });

        await tx.conversionIntent.update({
          where: {
            id: intent.id
          },
          data: {
            status: 'COMPLETED',
            confirmedAt: new Date()
          }
        });

        const updatedFlexBalance = await tx.walletBalance.findFirstOrThrow({
          where: {
            walletId: wallet.id,
            asset: 'FLEX_MILES'
          }
        });

        return {
          conversion,
          updatedFlexBalance
        };
      });

      await createNotification(prisma, {
        userId: request.currentUser.userId,
        type: 'CONVERSION_COMPLETED',
        title: 'Conversion completed',
        body: `${intent.amountOutMiles} FlexMiles were added to your wallet.`,
        actionUrl: '/transactions'
      });

      return {
        conversion: {
          id: result.conversion.id,
          providerKey: result.conversion.providerKey,
          amountInMiles: result.conversion.amountInMiles,
          amountOutMiles: result.conversion.amountOutMiles,
          status: 'COMPLETED' as const,
          createdAt: result.conversion.createdAt.toISOString()
        },
        walletBalance: {
          asset: 'FLEX_MILES' as const,
          amount: result.updatedFlexBalance.amount
        }
      };
    }
  );
}
