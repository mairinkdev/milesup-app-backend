import type { Prisma, PrismaClient } from '@prisma/client'

import { prisma } from './prisma'

type BillingPlanClient = Pick<PrismaClient, 'subscriptionPlan'>

export const defaultBillingPlans = [
  {
    code: 'FREE',
    name: 'MilesUp Free',
    description: 'Basic wallet, dashboard and account management.',
    country: 'BR',
    currency: 'BRL',
    monthlyAmountMinor: 0,
    yearlyAmountMinor: 0,
    highlighted: false,
    perks: ['Wallet overview', 'Provider connections', 'Basic history']
  },
  {
    code: 'PRO',
    name: 'MilesUp Pro',
    description:
      'Lower transfer and mileage conversion fees, exclusive benefits and priority support.',
    country: 'BR',
    currency: 'BRL',
    monthlyAmountMinor: 2990,
    yearlyAmountMinor: 29900,
    highlighted: true,
    perks: [
      'Discounted transfer fees',
      'Discounted mileage conversion fees',
      'Priority support',
      'Exclusive travel perks'
    ]
  }
] satisfies ReadonlyArray<Prisma.SubscriptionPlanCreateInput>

let billingPlansInitPromise: Promise<void> | null = null

async function ensureBillingPlansInternal(
  client: BillingPlanClient,
  country?: string
) {
  const plans = defaultBillingPlans.filter((plan) => !country || plan.country === country)

  await Promise.all(
    plans.map((plan) =>
      client.subscriptionPlan.upsert({
        where: {
          code_country: {
            code: plan.code,
            country: plan.country
          }
        },
        update: {
          name: plan.name,
          description: plan.description,
          highlighted: plan.highlighted,
          perks: plan.perks
        },
        create: plan
      })
    )
  )
}

export function ensureBillingPlans(
  client: BillingPlanClient = prisma,
  country?: string
) {
  if (client !== prisma || country) {
    return ensureBillingPlansInternal(client, country)
  }

  if (!billingPlansInitPromise) {
    billingPlansInitPromise = ensureBillingPlansInternal(client).catch((error) => {
      billingPlansInitPromise = null
      throw error
    })
  }

  return billingPlansInitPromise
}
