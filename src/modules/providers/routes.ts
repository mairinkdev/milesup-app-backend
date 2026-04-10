import { AssetKey, ConnectionStatus, NotificationType, Prisma, ProviderKey } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { AppError } from '../../lib/errors';
import { mapProvider, mapProviderConnection } from '../../lib/mappers';
import { createNotification } from '../../lib/notifications';
import { prisma } from '../../lib/prisma';

const PROVIDER_CONNECT_BONUS_MILES = 10000;
const PROVIDER_CONNECT_FLEX_BONUS = 10000;

const providerSchema = z.object({
  key: z.nativeEnum(ProviderKey),
  name: z.string(),
  description: z.string(),
  connectType: z.enum(['OAUTH', 'CREDENTIALS', 'MANUAL']),
  supportedAssets: z.array(z.string()),
  primaryAsset: z.string(),
  brandColor: z.string(),
  exchangeRateToFlex: z.number(),
  feeBps: z.number().int()
});

const providerConnectionSchema = z.object({
  id: z.string().uuid(),
  providerKey: z.nativeEnum(ProviderKey),
  providerName: z.string(),
  externalAccountId: z.string(),
  status: z.enum(['CONNECTED', 'DISCONNECTED', 'ERROR']),
  connectType: z.enum(['OAUTH', 'CREDENTIALS', 'MANUAL']),
  supportedAssets: z.array(z.string()),
  lastSyncedAt: z.string().nullable(),
  connectedAt: z.string(),
  metadata: z.unknown().nullable()
});

export async function providerRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/providers',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Providers'],
        summary: 'List provider catalog entries',
        response: {
          200: z.object({
            items: z.array(providerSchema)
          })
        }
      }
    },
    async () => {
      const providers = await prisma.provider.findMany({
        orderBy: {
          displayName: 'asc'
        }
      });

      return {
        items: providers.map(mapProvider)
      };
    }
  );

  typed.get(
    '/providers/:providerKey',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Providers'],
        summary: 'Get provider details',
        params: z.object({
          providerKey: z.nativeEnum(ProviderKey)
        }),
        response: {
          200: providerSchema
        }
      }
    },
    async (request) => {
      const provider = await prisma.provider.findUnique({
        where: {
          key: request.params.providerKey
        }
      });

      if (!provider) {
        throw new AppError({
          statusCode: 404,
          code: 'PROVIDER_NOT_FOUND',
          message: 'The requested provider was not found.'
        });
      }

      return mapProvider(provider);
    }
  );

  typed.get(
    '/provider-connections',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Providers'],
        summary: 'List the authenticated user provider connections',
        response: {
          200: z.object({
            items: z.array(providerConnectionSchema)
          })
        }
      }
    },
    async (request) => {
      const connections = await prisma.providerConnection.findMany({
        where: {
          userId: request.currentUser.userId
        },
        include: {
          provider: true
        },
        orderBy: {
          connectedAt: 'desc'
        }
      });

      return {
        items: connections.map((connection) =>
          mapProviderConnection(connection, connection.provider)
        )
      };
    }
  );

  typed.post(
    '/provider-connections',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Providers'],
        summary: 'Create a provider connection',
        body: z.object({
          providerKey: z.nativeEnum(ProviderKey),
          externalAccountId: z.string().min(3),
          email: z.string().email().optional(),
          secret: z.string().min(3).optional(),
          metadata: z.record(z.string(), z.unknown()).optional()
        }),
        response: {
          201: providerConnectionSchema
        }
      }
    },
    async (request, reply) => {
      const provider = await prisma.provider.findUnique({
        where: {
          key: request.body.providerKey
        }
      });

      if (!provider) {
        throw new AppError({
          statusCode: 404,
          code: 'PROVIDER_NOT_FOUND',
          message: 'The selected provider was not found.'
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
          message: 'The user wallet is not available.'
        });
      }

      const existing = await prisma.providerConnection.findFirst({
        where: {
          userId: request.currentUser.userId,
          providerKey: request.body.providerKey,
          externalAccountId: request.body.externalAccountId
        }
      });

      if (existing && existing.status === ConnectionStatus.CONNECTED) {
        throw new AppError({
          statusCode: 409,
          code: 'PROVIDER_ALREADY_CONNECTED',
          message: 'This provider account is already connected.'
        });
      }

      const isFirstTimeConnection = !existing;

      const result = await prisma.$transaction(async (tx) => {
        let txConnection;

        if (existing) {
          txConnection = await tx.providerConnection.update({
            where: {
              id: existing.id
            },
            data: {
              status: ConnectionStatus.CONNECTED,
              email: request.body.email,
              secretMasked: request.body.secret ? 'configured' : existing.secretMasked,
              metadata: request.body.metadata as Prisma.InputJsonValue | undefined,
              connectedAt: new Date(),
              lastSyncedAt: new Date(),
              disconnectedAt: null
            },
            include: {
              provider: true
            }
          });
        } else {
          txConnection = await tx.providerConnection.create({
            data: {
              userId: request.currentUser.userId,
              providerKey: request.body.providerKey,
              externalAccountId: request.body.externalAccountId,
              email: request.body.email,
              secretMasked: request.body.secret ? 'configured' : null,
              metadata: request.body.metadata as Prisma.InputJsonValue | undefined,
              status: ConnectionStatus.CONNECTED,
              lastSyncedAt: new Date()
            },
            include: {
              provider: true
            }
          });
        }

        if (isFirstTimeConnection && provider.primaryAsset !== AssetKey.FLEX_MILES) {
          await tx.walletBalance.upsert({
            where: {
              walletId_asset: {
                walletId: wallet.id,
                asset: provider.primaryAsset
              }
            },
            update: {
              amount: {
                increment: PROVIDER_CONNECT_BONUS_MILES
              }
            },
            create: {
              walletId: wallet.id,
              asset: provider.primaryAsset,
              amount: PROVIDER_CONNECT_BONUS_MILES
            }
          });

          await tx.walletBalance.upsert({
            where: {
              walletId_asset: {
                walletId: wallet.id,
                asset: AssetKey.FLEX_MILES
              }
            },
            update: {
              amount: {
                increment: PROVIDER_CONNECT_FLEX_BONUS
              }
            },
            create: {
              walletId: wallet.id,
              asset: AssetKey.FLEX_MILES,
              amount: PROVIDER_CONNECT_FLEX_BONUS
            }
          });
        }

        return txConnection;
      });

      if (isFirstTimeConnection && provider.primaryAsset !== AssetKey.FLEX_MILES) {
        await createNotification(prisma, {
          userId: request.currentUser.userId,
          type: NotificationType.TRANSFER_RECEIVED,
          title: 'Bonus de conexao recebido',
          body: `Voce ganhou ${PROVIDER_CONNECT_BONUS_MILES.toLocaleString('pt-BR')} milhas ${result.provider.displayName} e ${PROVIDER_CONNECT_FLEX_BONUS.toLocaleString('pt-BR')} FlexMiles por conectar ${result.provider.displayName}.`,
          actionUrl: '/dashboard'
        });
      }

      reply.status(201);
      return mapProviderConnection(result, result.provider);
    }
  );

  typed.delete(
    '/provider-connections/:connectionId',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Providers'],
        summary: 'Disconnect a provider connection',
        params: z.object({
          connectionId: z.string().uuid()
        }),
        response: {
          200: z.object({
            ok: z.boolean()
          })
        }
      }
    },
    async (request) => {
      const connection = await prisma.providerConnection.findFirst({
        where: {
          id: request.params.connectionId,
          userId: request.currentUser.userId
        }
      });

      if (!connection) {
        throw new AppError({
          statusCode: 404,
          code: 'PROVIDER_CONNECTION_NOT_FOUND',
          message: 'The provider connection was not found.'
        });
      }

      await prisma.providerConnection.update({
        where: {
          id: connection.id
        },
        data: {
          status: ConnectionStatus.DISCONNECTED,
          disconnectedAt: new Date()
        }
      });

      return { ok: true };
    }
  );
}
