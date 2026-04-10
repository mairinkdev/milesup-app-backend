import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../../config/env';
import { createNotification } from '../../lib/notifications';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { buildRecipientDisplay } from '../../lib/notifications';
import { verifySecret } from '../../lib/auth';

const recipientSchema = z.object({
  userId: z.string().uuid(),
  walletId: z.string().uuid(),
  displayName: z.string(),
  handle: z.string(),
  avatarUrl: z.string().nullable()
});

export async function transferRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/recipient-resolution',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Transfers'],
        summary: 'Resolve a recipient by email or FlexKey',
        body: z.object({
          query: z.string().min(3)
        }),
        response: {
          200: recipientSchema
        }
      }
    },
    async (request) => {
      const query = request.body.query.trim().toLowerCase();

      const recipient = await prisma.user.findFirst({
        where: {
          id: {
            not: request.currentUser.userId
          },
          OR: [{ email: query }, { flexKey: query }]
        },
        include: {
          wallet: true
        }
      });

      if (!recipient?.wallet) {
        throw new AppError({
          statusCode: 404,
          code: 'RECIPIENT_NOT_FOUND',
          message: 'The recipient could not be resolved.'
        });
      }

      const display = buildRecipientDisplay(recipient);

      return {
        userId: recipient.id,
        walletId: recipient.wallet.id,
        displayName: display.displayName,
        handle: display.handle,
        avatarUrl: recipient.profilePhotoAssetId
          ? `${env.APP_BASE_URL}/v1/media/${recipient.profilePhotoAssetId}`
          : null
      };
    }
  );

  typed.post(
    '/intents',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Transfers'],
        summary: 'Create a transfer intent',
        body: z.object({
          recipientHandleOrEmail: z.string().min(3),
          amountMiles: z.number().int().min(1000),
          note: z.string().max(280).optional()
        }),
        response: {
          201: z.object({
            id: z.string().uuid(),
            amountMiles: z.number().int(),
            feeMiles: z.number().int(),
            expiresAt: z.string(),
            recipient: recipientSchema,
            note: z.string().nullable()
          })
        }
      }
    },
    async (request, reply) => {
      const sender = await prisma.user.findUnique({
        where: {
          id: request.currentUser.userId
        },
        include: {
          wallet: {
            include: {
              balances: true
            }
          }
        }
      });

      if (!sender?.wallet) {
        throw new AppError({
          statusCode: 404,
          code: 'WALLET_NOT_FOUND',
          message: 'The sender wallet could not be found.'
        });
      }

      const flexBalance = sender.wallet.balances.find((balance) => balance.asset === 'FLEX_MILES');

      if (!flexBalance || flexBalance.amount < request.body.amountMiles) {
        throw new AppError({
          statusCode: 400,
          code: 'INSUFFICIENT_FUNDS',
          message: 'There is not enough FlexMiles balance for this transfer.'
        });
      }

      const query = request.body.recipientHandleOrEmail.trim().toLowerCase();
      const recipient = await prisma.user.findFirst({
        where: {
          id: {
            not: request.currentUser.userId
          },
          OR: [{ email: query }, { flexKey: query }]
        },
        include: {
          wallet: true
        }
      });

      if (!recipient?.wallet) {
        throw new AppError({
          statusCode: 404,
          code: 'RECIPIENT_NOT_FOUND',
          message: 'The recipient could not be resolved.'
        });
      }

      const intent = await prisma.transferIntent.create({
        data: {
          fromUserId: sender.id,
          fromWalletId: sender.wallet.id,
          toUserId: recipient.id,
          toWalletId: recipient.wallet.id,
          recipientHandle: recipient.flexKey,
          recipientLabel: recipient.companyName || recipient.name,
          amountMiles: request.body.amountMiles,
          note: request.body.note,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }
      });

      reply.status(201);
      return {
        id: intent.id,
        amountMiles: intent.amountMiles,
        feeMiles: intent.feeMiles,
        expiresAt: intent.expiresAt.toISOString(),
        note: intent.note,
        recipient: {
          userId: recipient.id,
          walletId: recipient.wallet.id,
          displayName: recipient.companyName || recipient.name,
          handle: recipient.flexKey,
          avatarUrl: null
        }
      };
    }
  );

  typed.post(
    '/intents/:intentId/confirm',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Transfers'],
        summary: 'Confirm a transfer intent with the wallet PIN',
        params: z.object({
          intentId: z.string().uuid()
        }),
        body: z.object({
          pinCode: z.string().length(6)
        }),
        response: {
          200: z.object({
            transfer: z.object({
              id: z.string().uuid(),
              amountMiles: z.number().int(),
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
        prisma.transferIntent.findFirst({
          where: {
            id: request.params.intentId,
            fromUserId: request.currentUser.userId
          }
        })
      ]);

      if (!user || !intent) {
        throw new AppError({
          statusCode: 404,
          code: 'TRANSFER_INTENT_NOT_FOUND',
          message: 'The transfer intent was not found.'
        });
      }

      if (intent.expiresAt < new Date()) {
        throw new AppError({
          statusCode: 410,
          code: 'TRANSFER_INTENT_EXPIRED',
          message: 'The transfer intent has expired.'
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
        const senderWallet = await tx.wallet.findUnique({
          where: {
            id: intent.fromWalletId
          },
          include: {
            balances: true
          }
        });

        const recipientWallet = await tx.wallet.findUnique({
          where: {
            id: intent.toWalletId ?? undefined
          },
          include: {
            balances: true
          }
        });

        if (!senderWallet || !recipientWallet) {
          throw new AppError({
            statusCode: 404,
            code: 'WALLET_NOT_FOUND',
            message: 'The wallets involved in the transfer were not found.'
          });
        }

        const senderFlex = senderWallet.balances.find((balance) => balance.asset === 'FLEX_MILES');
        const recipientFlex = recipientWallet.balances.find((balance) => balance.asset === 'FLEX_MILES');

        if (!senderFlex || senderFlex.amount < intent.amountMiles) {
          throw new AppError({
            statusCode: 400,
            code: 'INSUFFICIENT_FUNDS',
            message: 'There is not enough FlexMiles balance for this transfer.'
          });
        }

        await tx.walletBalance.update({
          where: {
            id: senderFlex.id
          },
          data: {
            amount: {
              decrement: intent.amountMiles
            }
          }
        });

        if (recipientFlex) {
          await tx.walletBalance.update({
            where: {
              id: recipientFlex.id
            },
            data: {
              amount: {
                increment: intent.amountMiles
              }
            }
          });
        } else {
          await tx.walletBalance.create({
            data: {
              walletId: recipientWallet.id,
              asset: 'FLEX_MILES',
              amount: intent.amountMiles
            }
          });
        }

        const transfer = await tx.transfer.create({
          data: {
            fromUserId: intent.fromUserId,
            fromWalletId: intent.fromWalletId,
            toUserId: intent.toUserId!,
            toWalletId: intent.toWalletId!,
            amountMiles: intent.amountMiles,
            feeMiles: intent.feeMiles,
            note: intent.note,
            usedSecurityMode: senderWallet.securityModeActive,
            completedAt: new Date()
          }
        });

        await tx.transferIntent.update({
          where: {
            id: intent.id
          },
          data: {
            status: 'COMPLETED',
            confirmedAt: new Date()
          }
        });

        const updatedBalance = await tx.walletBalance.findUniqueOrThrow({
          where: {
            id: senderFlex.id
          }
        });

        return {
          transfer,
          updatedBalance
        };
      });

      await Promise.all([
        createNotification(prisma, {
          userId: request.currentUser.userId,
          type: 'TRANSFER_SENT',
          title: 'Transfer sent successfully',
          body: `${intent.amountMiles} FlexMiles were sent to ${intent.recipientLabel}.`,
          actionUrl: '/transactions'
        }),
        createNotification(prisma, {
          userId: intent.toUserId!,
          type: 'TRANSFER_RECEIVED',
          title: 'FlexMiles received',
          body: `${intent.amountMiles} FlexMiles were received from another MilesUp user.`,
          actionUrl: '/transactions'
        })
      ]);

      return {
        transfer: {
          id: result.transfer.id,
          amountMiles: result.transfer.amountMiles,
          status: 'COMPLETED' as const,
          createdAt: result.transfer.createdAt.toISOString()
        },
        walletBalance: {
          asset: 'FLEX_MILES' as const,
          amount: result.updatedBalance.amount
        }
      };
    }
  );
}
