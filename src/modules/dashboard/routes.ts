import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { loadWalletActivities } from '../../lib/activity';
import { mapProviderConnection, mapSubscription, mapWallet } from '../../lib/mappers';
import { prisma } from '../../lib/prisma';

const activityParticipantSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  flexKey: z.string(),
  avatarUrl: z.string().nullable()
});

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
  sender: activityParticipantSchema.nullable(),
  recipient: activityParticipantSchema.nullable()
});

export async function dashboardRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/dashboard',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Dashboard'],
        summary: 'Get the main dashboard aggregate',
        querystring: z.object({
          period: z.enum(['7d', '15d', '30d', '90d']).default('30d')
        }),
        response: {
          200: z.object({
            wallet: z.object({
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
              updatedAt: z.string(),
              totalMiles: z.number().int(),
              estimatedValue: z.object({
                amountMinor: z.number().int(),
                currency: z.literal('BRL')
              })
            }),
            metrics: z.object({
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
            connectedProviders: z.array(
              z.object({
                id: z.string().uuid(),
                providerKey: z.string(),
                providerName: z.string(),
                externalAccountId: z.string(),
                status: z.string(),
                connectType: z.string(),
                supportedAssets: z.array(z.string()),
                lastSyncedAt: z.string().nullable(),
                connectedAt: z.string(),
                metadata: z.unknown().nullable()
              })
            ),
            recentActivities: z.array(
              activitySchema
            ),
            subscription: z
              .object({
                id: z.string().uuid(),
                planCode: z.string(),
                planName: z.string(),
                status: z.string(),
                interval: z.string().nullable(),
                cancelAtPeriodEnd: z.boolean(),
                currentPeriodStart: z.string().nullable(),
                currentPeriodEnd: z.string().nullable(),
                nextBillingDate: z.string().nullable(),
                nextAmountMinor: z.number().int(),
                currency: z.string(),
                paymentMethod: z
                  .object({
                    id: z.string().uuid(),
                    providerRef: z.string(),
                    type: z.string(),
                    brand: z.string(),
                    last4: z.string(),
                    expMonth: z.number().int(),
                    expYear: z.number().int(),
                    holderName: z.string().nullable(),
                    isDefault: z.boolean()
                  })
                  .nullable(),
                updatedAt: z.string()
              })
              .nullable()
          })
        }
      }
    },
    async (request) => {
      const [wallet, connections, subscriptionRecord, activities] = await Promise.all([
        prisma.wallet.findUnique({
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
        }),
        prisma.providerConnection.findMany({
          where: {
            userId: request.currentUser.userId,
            status: 'CONNECTED'
          },
          include: {
            provider: true
          },
          orderBy: {
            connectedAt: 'desc'
          },
          take: 5
        }),
        prisma.subscription.findFirst({
          where: {
            userId: request.currentUser.userId
          },
          include: {
            plan: true,
            paymentMethod: true
          },
          orderBy: {
            updatedAt: 'desc'
          }
        }),
        loadWalletActivities(prisma, {
          userId: request.currentUser.userId,
          period: request.query.period,
          kind: 'ALL',
          direction: 'ALL',
          page: 1,
          pageSize: 5
        })
      ]);

      if (!wallet) {
        throw new Error('Wallet not found for authenticated user.');
      }

      const totalMiles = wallet.balances.reduce((sum, balance) => sum + balance.amount, 0);

      return {
        wallet: {
          ...mapWallet(wallet, wallet.balances),
          totalMiles,
          estimatedValue: {
            amountMinor: totalMiles * 7,
            currency: 'BRL' as const
          }
        },
        metrics: activities.summary,
        connectedProviders: connections.map((connection) =>
          mapProviderConnection(connection, connection.provider)
        ),
        recentActivities: activities.items,
        subscription: subscriptionRecord
          ? mapSubscription(
              subscriptionRecord,
              subscriptionRecord.plan,
              subscriptionRecord.paymentMethod
            )
          : null
      };
    }
  );
}
