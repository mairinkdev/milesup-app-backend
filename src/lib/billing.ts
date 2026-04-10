import { BillingInterval, CheckoutStatus, InvoiceStatus, PaymentMethodType, SubscriptionStatus } from '@prisma/client';
import type { Prisma, PrismaClient, SubscriptionPlan, User } from '@prisma/client';

import { addDays, generateOpaqueToken } from './auth';
import { AppError } from './errors';

export function getPlanAmount(plan: SubscriptionPlan, interval: BillingInterval) {
  return interval === BillingInterval.MONTH ? plan.monthlyAmountMinor : plan.yearlyAmountMinor;
}

export async function ensureDefaultFreeSubscription(
  prisma: PrismaClient,
  userId: string,
  country = 'BR'
) {
  const freePlan = await prisma.subscriptionPlan.findFirst({
    where: {
      code: 'FREE',
      country
    }
  });

  if (!freePlan) {
    throw new AppError({
      statusCode: 500,
      code: 'FREE_PLAN_NOT_CONFIGURED',
      message: 'The default FREE plan has not been configured.'
    });
  }

  const existing = await prisma.subscription.findFirst({
    where: {
      userId
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });

  if (existing) {
    return existing;
  }

  return prisma.subscription.create({
    data: {
      userId,
      planId: freePlan.id,
      status: SubscriptionStatus.FREE,
      currency: freePlan.currency,
      nextAmountMinor: 0
    }
  });
}

export async function createCheckoutSession(
  prisma: PrismaClient,
  options: {
    user: User;
    plan: SubscriptionPlan;
    interval: BillingInterval;
    successRedirectUrl: string;
    cancelRedirectUrl: string;
    email: string;
    appBaseUrl: string;
  }
) {
  const amountMinor = getPlanAmount(options.plan, options.interval);
  const publicToken = generateOpaqueToken(20);

  const record = await prisma.checkoutSession.create({
    data: {
      userId: options.user.id,
      planId: options.plan.id,
      interval: options.interval,
      country: options.plan.country,
      currency: options.plan.currency,
      amountMinor,
      email: options.email,
      successRedirectUrl: options.successRedirectUrl,
      cancelRedirectUrl: options.cancelRedirectUrl,
      publicToken,
      expiresAt: addDays(new Date(), 1)
    }
  });

  return {
    session: record,
    url: `${options.appBaseUrl}/checkout/${record.publicToken}`
  };
}

export async function completeCheckoutSession(
  prisma: PrismaClient,
  checkoutId: string
) {
  const checkout = await prisma.checkoutSession.findUnique({
    where: { id: checkoutId },
    include: {
      user: true,
      plan: true
    }
  });

  if (!checkout || checkout.status !== CheckoutStatus.OPEN) {
    throw new AppError({
      statusCode: 404,
      code: 'CHECKOUT_SESSION_NOT_AVAILABLE',
      message: 'The checkout session is not available.'
    });
  }

  const paymentMethod = await prisma.paymentMethod.create({
    data: {
      userId: checkout.userId,
      providerRef: `pm_${generateOpaqueToken(8)}`,
      type: PaymentMethodType.CARD,
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: new Date().getFullYear() + 2,
      holderName: checkout.user.name,
      isDefault: true
    }
  });

  await prisma.paymentMethod.updateMany({
    where: {
      userId: checkout.userId,
      id: {
        not: paymentMethod.id
      }
    },
    data: {
      isDefault: false
    }
  });

  const currentStart = new Date();
  const currentEnd = new Date(currentStart);
  currentEnd.setDate(
    currentEnd.getDate() + (checkout.interval === BillingInterval.MONTH ? 30 : 365)
  );

  const existingSubscription = await prisma.subscription.findFirst({
    where: {
      userId: checkout.userId
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });

  const subscriptionData: Prisma.SubscriptionUncheckedCreateInput = {
    userId: checkout.userId,
    planId: checkout.planId,
    status: SubscriptionStatus.ACTIVE,
    interval: checkout.interval,
    currency: checkout.currency,
    nextAmountMinor: checkout.amountMinor,
    paymentMethodId: paymentMethod.id,
    currentPeriodStart: currentStart,
    currentPeriodEnd: currentEnd,
    nextBillingDate: currentEnd
  };

  const subscription =
    existingSubscription
      ? await prisma.subscription.update({
          where: {
            id: existingSubscription.id
          },
          data: {
            planId: checkout.planId,
            status: SubscriptionStatus.ACTIVE,
            interval: checkout.interval,
            currency: checkout.currency,
            nextAmountMinor: checkout.amountMinor,
            paymentMethodId: paymentMethod.id,
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            currentPeriodStart: currentStart,
            currentPeriodEnd: currentEnd,
            nextBillingDate: currentEnd
          }
        })
      : await prisma.subscription.create({
          data: subscriptionData
        });

  await prisma.invoice.create({
    data: {
      userId: checkout.userId,
      subscriptionId: subscription.id,
      status: InvoiceStatus.PAID,
      amountDueMinor: checkout.amountMinor,
      amountPaidMinor: checkout.amountMinor,
      amountRemainingMinor: 0,
      currency: checkout.currency,
      hostedInvoiceUrl: `${process.env.APP_BASE_URL ?? ''}/v1/billing/invoices/${subscription.id}`,
      dueDate: currentStart,
      periodStart: currentStart,
      periodEnd: currentEnd,
      paidAt: currentStart
    }
  });

  await prisma.checkoutSession.update({
    where: {
      id: checkout.id
    },
    data: {
      status: CheckoutStatus.COMPLETED,
      completedAt: new Date(),
      paymentMethodId: paymentMethod.id,
      subscriptionId: subscription.id
    }
  });

  return {
    checkout,
    paymentMethod,
    subscription
  };
}
