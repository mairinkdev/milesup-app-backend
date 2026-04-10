import {
  BillingInterval,
  CheckoutStatus,
  NotificationType,
  PaymentMethodType,
  SubscriptionStatus
} from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../../config/env';
import {
  completeCheckoutSession,
  createCheckoutSession,
  ensureDefaultFreeSubscription,
  getPlanAmount
} from '../../lib/billing';
import { ensureBillingPlans } from '../../lib/billingPlans';
import { AppError } from '../../lib/errors';
import {
  mapInvoice,
  mapPaymentMethod,
  mapPlan,
  mapSubscription
} from '../../lib/mappers';
import { createNotification } from '../../lib/notifications';
import { prisma } from '../../lib/prisma';

const paymentMethodSchema = z.object({
  id: z.string().uuid(),
  providerRef: z.string(),
  type: z.enum(['CARD', 'PIX', 'OTHER']),
  brand: z.string(),
  last4: z.string(),
  expMonth: z.number().int(),
  expYear: z.number().int(),
  holderName: z.string().nullable(),
  isDefault: z.boolean()
});

const subscriptionSchema = z.object({
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
  paymentMethod: paymentMethodSchema.nullable(),
  updatedAt: z.string()
});

function renderCheckoutHtml(options: {
  title: string;
  description: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${options.title}</title>
    <style>
      body { font-family: Arial, sans-serif; background:#f4f7fb; color:#162033; padding:40px; }
      .card { max-width:580px; margin:0 auto; background:#fff; border-radius:16px; padding:32px; box-shadow:0 12px 40px rgba(0,0,0,0.08); }
      h1 { margin-top:0; }
      p { line-height:1.6; }
      .actions { display:flex; gap:12px; margin-top:24px; }
      a { text-decoration:none; padding:14px 18px; border-radius:10px; font-weight:600; }
      .primary { background:#0f62fe; color:#fff; }
      .secondary { background:#e8eefc; color:#0f62fe; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${options.title}</h1>
      <p>${options.description}</p>
      <div class="actions">
        ${options.primaryCta ? `<a class="primary" href="${options.primaryCta.href}">${options.primaryCta.label}</a>` : ''}
        ${options.secondaryCta ? `<a class="secondary" href="${options.secondaryCta.href}">${options.secondaryCta.label}</a>` : ''}
      </div>
    </div>
  </body>
</html>`;
}

export async function billingRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/v1/billing/plans',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Billing'],
        summary: 'List public billing plans',
        querystring: z.object({
          country: z.string().default('BR')
        }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string().uuid(),
                code: z.string(),
                name: z.string(),
                description: z.string(),
                country: z.string(),
                currency: z.string(),
                monthlyAmountMinor: z.number().int(),
                yearlyAmountMinor: z.number().int(),
                highlighted: z.boolean(),
                perks: z.array(z.string())
              })
            )
          })
        }
      }
    },
    async (request) => {
      await ensureBillingPlans(prisma, request.query.country)

      const plans = await prisma.subscriptionPlan.findMany({
        where: {
          country: request.query.country
        },
        orderBy: [{ highlighted: 'desc' }, { monthlyAmountMinor: 'asc' }]
      });

      return {
        items: plans.map(mapPlan)
      };
    }
  );

  typed.get(
    '/v1/billing/subscription',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Billing'],
        summary: 'Get the current subscription',
        response: {
          200: subscriptionSchema
        }
      }
    },
    async (request) => {
      await ensureDefaultFreeSubscription(prisma, request.currentUser.userId);

      const subscription = await prisma.subscription.findFirstOrThrow({
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
      });

      return mapSubscription(subscription, subscription.plan, subscription.paymentMethod);
    }
  );

  typed.post(
    '/v1/billing/checkout-sessions',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Billing'],
        summary: 'Create a hosted checkout session',
        body: z.object({
          planCode: z.string(),
          interval: z.nativeEnum(BillingInterval),
          successRedirectUrl: z.string().url(),
          cancelRedirectUrl: z.string().url(),
          email: z.string().email().optional()
        }),
        response: {
          201: z.object({
            id: z.string().uuid(),
            url: z.string().url(),
            expiresAt: z.string()
          })
        }
      }
    },
    async (request, reply) => {
      await ensureBillingPlans(prisma, 'BR')

      const user = await prisma.user.findUniqueOrThrow({
        where: {
          id: request.currentUser.userId
        }
      });

      const plan = await prisma.subscriptionPlan.findFirst({
        where: {
          code: request.body.planCode,
          country: 'BR'
        }
      });

      if (!plan) {
        throw new AppError({
          statusCode: 404,
          code: 'PLAN_NOT_FOUND',
          message: 'The requested billing plan was not found.'
        });
      }

      const { session, url } = await createCheckoutSession(prisma, {
        user,
        plan,
        interval: request.body.interval,
        successRedirectUrl: request.body.successRedirectUrl,
        cancelRedirectUrl: request.body.cancelRedirectUrl,
        email: request.body.email ?? user.email,
        appBaseUrl: env.APP_BASE_URL
      });

      reply.status(201);
      return {
        id: session.id,
        url,
        expiresAt: session.expiresAt.toISOString()
      };
    }
  );

  typed.get(
    '/v1/billing/invoices',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Billing'],
        summary: 'List billing invoices',
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          pageSize: z.coerce.number().int().positive().max(50).default(10)
        }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string().uuid(),
                status: z.string(),
                amountDueMinor: z.number().int(),
                amountPaidMinor: z.number().int(),
                amountRemainingMinor: z.number().int(),
                currency: z.string(),
                hostedInvoiceUrl: z.string().nullable(),
                invoicePdfUrl: z.string().nullable(),
                dueDate: z.string(),
                periodStart: z.string(),
                periodEnd: z.string(),
                paidAt: z.string().nullable(),
                createdAt: z.string()
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
        prisma.invoice.findMany({
          where: {
            userId: request.currentUser.userId
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: (request.query.page - 1) * request.query.pageSize,
          take: request.query.pageSize
        }),
        prisma.invoice.count({
          where: {
            userId: request.currentUser.userId
          }
        })
      ]);

      return {
        items: items.map(mapInvoice),
        page: request.query.page,
        pageSize: request.query.pageSize,
        totalItems,
        totalPages: Math.max(Math.ceil(totalItems / request.query.pageSize), 1)
      };
    }
  );

  typed.get(
    '/v1/billing/payment-methods',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Billing'],
        summary: 'List available payment methods',
        response: {
          200: z.object({
            items: z.array(paymentMethodSchema),
            defaultPaymentMethodId: z.string().uuid().nullable()
          })
        }
      }
    },
    async (request) => {
      const methods = await prisma.paymentMethod.findMany({
        where: {
          userId: request.currentUser.userId
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
      });

      return {
        items: methods.map(mapPaymentMethod),
        defaultPaymentMethodId: methods.find((method) => method.isDefault)?.id ?? null
      };
    }
  );

  typed.patch(
    '/v1/billing/payment-methods/default',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Billing'],
        summary: 'Set the default payment method',
        body: z.object({
          paymentMethodId: z.string().uuid()
        }),
        response: {
          200: paymentMethodSchema
        }
      }
    },
    async (request) => {
      const paymentMethod = await prisma.paymentMethod.findFirst({
        where: {
          id: request.body.paymentMethodId,
          userId: request.currentUser.userId
        }
      });

      if (!paymentMethod) {
        throw new AppError({
          statusCode: 404,
          code: 'PAYMENT_METHOD_NOT_FOUND',
          message: 'The payment method was not found.'
        });
      }

      await prisma.paymentMethod.updateMany({
        where: {
          userId: request.currentUser.userId
        },
        data: {
          isDefault: false
        }
      });

      const updated = await prisma.paymentMethod.update({
        where: {
          id: paymentMethod.id
        },
        data: {
          isDefault: true
        }
      });

      await prisma.subscription.updateMany({
        where: {
          userId: request.currentUser.userId
        },
        data: {
          paymentMethodId: updated.id
        }
      });

      return mapPaymentMethod(updated);
    }
  );

  typed.post(
    '/v1/billing/subscription/cancel',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Billing'],
        summary: 'Cancel the current subscription',
        body: z.object({
          atPeriodEnd: z.boolean().default(true)
        }),
        response: {
          200: subscriptionSchema
        }
      }
    },
    async (request) => {
      const subscription = await prisma.subscription.findFirstOrThrow({
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
      });

      const updated = await prisma.subscription.update({
        where: {
          id: subscription.id
        },
        data: {
          cancelAtPeriodEnd: request.body.atPeriodEnd,
          status: request.body.atPeriodEnd ? subscription.status : SubscriptionStatus.CANCELLED,
          cancelledAt: request.body.atPeriodEnd ? null : new Date()
        },
        include: {
          plan: true,
          paymentMethod: true
        }
      });

      return mapSubscription(updated, updated.plan, updated.paymentMethod);
    }
  );

  typed.post(
    '/v1/billing/subscription/change-plan',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Billing'],
        summary: 'Change the current subscription plan',
        body: z.object({
          planCode: z.string(),
          interval: z.nativeEnum(BillingInterval)
        }),
        response: {
          200: subscriptionSchema
        }
      }
    },
    async (request) => {
      await ensureBillingPlans(prisma, 'BR')

      const [subscription, plan] = await Promise.all([
        prisma.subscription.findFirstOrThrow({
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
        prisma.subscriptionPlan.findFirst({
          where: {
            code: request.body.planCode,
            country: 'BR'
          }
        })
      ]);

      if (!plan) {
        throw new AppError({
          statusCode: 404,
          code: 'PLAN_NOT_FOUND',
          message: 'The requested billing plan was not found.'
        });
      }

      const nextAmountMinor = getPlanAmount(plan, request.body.interval);

      const updated = await prisma.subscription.update({
        where: {
          id: subscription.id
        },
        data: {
          planId: plan.id,
          interval: request.body.interval,
          status: plan.code === 'FREE' ? SubscriptionStatus.FREE : SubscriptionStatus.ACTIVE,
          nextAmountMinor,
          currency: plan.currency
        },
        include: {
          plan: true,
          paymentMethod: true
        }
      });

      return mapSubscription(updated, updated.plan, updated.paymentMethod);
    }
  );

  typed.get(
    '/checkout/:publicToken',
    {
      schema: {
        tags: ['Hosted Checkout'],
        hide: true,
        params: z.object({
          publicToken: z.string()
        }),
        response: {
          200: z.any()
        }
      }
    },
    async (request, reply) => {
      const checkout = await prisma.checkoutSession.findUnique({
        where: {
          publicToken: request.params.publicToken
        },
        include: {
          plan: true
        }
      });

      if (!checkout || checkout.status !== CheckoutStatus.OPEN) {
        reply.type('text/html').send(
          renderCheckoutHtml({
            title: 'Checkout unavailable',
            description:
              'This hosted checkout session is no longer available. Return to the app and create a new one.'
          })
        );
        return;
      }

      reply.type('text/html').send(
        renderCheckoutHtml({
          title: `MilesUp ${checkout.plan.name}`,
          description: `This hosted checkout will activate the ${checkout.plan.name} plan for ${checkout.email}. Amount due: ${checkout.amountMinor / 100} ${checkout.currency}.`,
          primaryCta: {
            label: 'Complete checkout',
            href: `${env.APP_BASE_URL}/checkout/${checkout.publicToken}/complete`
          },
          secondaryCta: {
            label: 'Cancel',
            href: `${env.APP_BASE_URL}/checkout/${checkout.publicToken}/cancel`
          }
        })
      );
    }
  );

  typed.get(
    '/checkout/:publicToken/complete',
    {
      schema: {
        hide: true,
        params: z.object({
          publicToken: z.string()
        }),
        response: {
          200: z.any()
        }
      }
    },
    async (request, reply) => {
      const checkout = await prisma.checkoutSession.findUnique({
        where: {
          publicToken: request.params.publicToken
        }
      });

      if (!checkout || checkout.status !== CheckoutStatus.OPEN) {
        reply.type('text/html').send(
          renderCheckoutHtml({
            title: 'Checkout unavailable',
            description: 'This checkout session cannot be completed anymore.'
          })
        );
        return;
      }

      const result = await completeCheckoutSession(prisma, checkout.id);

      await createNotification(prisma, {
        userId: result.checkout.userId,
        type: NotificationType.BILLING,
        title: 'Subscription activated',
        body: 'Your MilesUp subscription is now active.',
        actionUrl: '/subscriptions'
      });

      reply.redirect(result.checkout.successRedirectUrl);
    }
  );

  typed.get(
    '/checkout/:publicToken/cancel',
    {
      schema: {
        hide: true,
        params: z.object({
          publicToken: z.string()
        }),
        response: {
          200: z.any()
        }
      }
    },
    async (request, reply) => {
      const checkout = await prisma.checkoutSession.findUnique({
        where: {
          publicToken: request.params.publicToken
        }
      });

      if (!checkout) {
        reply.type('text/html').send(
          renderCheckoutHtml({
            title: 'Checkout unavailable',
            description: 'This checkout session was not found.'
          })
        );
        return;
      }

      await prisma.checkoutSession.update({
        where: {
          id: checkout.id
        },
        data: {
          status: CheckoutStatus.CANCELLED,
          cancelledAt: new Date()
        }
      });

      reply.redirect(checkout.cancelRedirectUrl);
    }
  );
}
