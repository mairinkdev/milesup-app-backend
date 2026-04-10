import {
  BillingInterval,
  ConnectionStatus,
  PaymentMethodType,
  Prisma,
  PrismaClient,
  SessionStatus,
  SubscriptionStatus
} from '@prisma/client';

import { hashRefreshToken, hashSecret } from '../src/lib/auth';
import { generateFlexKey } from '../src/lib/verification';

const prisma = new PrismaClient();

async function resetDatabase() {
  await prisma.notification.deleteMany();
  await prisma.supportMessage.deleteMany();
  await prisma.supportConversation.deleteMany();
  await prisma.supportFaq.deleteMany();
  await prisma.checkoutSession.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.conversion.deleteMany();
  await prisma.conversionIntent.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.transferIntent.deleteMany();
  await prisma.securityModeSession.deleteMany();
  await prisma.providerConnection.deleteMany();
  await prisma.walletBalance.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.verificationCode.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await resetDatabase();

  const passwordHash = await hashSecret('Password#123');
  const pinHash = await hashSecret('654321');

  const providers: Prisma.ProviderCreateInput[] = [
    {
      key: 'LATAM_PASS',
      displayName: 'LATAM Pass',
      description: 'LATAM Airlines loyalty program',
      connectType: 'CREDENTIALS',
      supportedAssets: ['LATAM_PASS'],
      primaryAsset: 'LATAM_PASS',
      brandColor: '#E4002B',
      providerToFlexRate: 1.1,
      providerToFlexFeeBps: 200
    },
    {
      key: 'LIVELO',
      displayName: 'Livelo',
      description: 'Multi-partner points program',
      connectType: 'CREDENTIALS',
      supportedAssets: ['LIVELO'],
      primaryAsset: 'LIVELO',
      brandColor: '#6B2D8B',
      providerToFlexRate: 1.0,
      providerToFlexFeeBps: 250
    },
    {
      key: 'SMILES',
      displayName: 'Smiles',
      description: 'GOL Airlines rewards program',
      connectType: 'CREDENTIALS',
      supportedAssets: ['SMILES'],
      primaryAsset: 'SMILES',
      brandColor: '#FF6600',
      providerToFlexRate: 0.95,
      providerToFlexFeeBps: 180
    },
    {
      key: 'TUDOAZUL',
      displayName: 'TudoAzul',
      description: 'Azul airline loyalty points',
      connectType: 'CREDENTIALS',
      supportedAssets: ['TUDOAZUL'],
      primaryAsset: 'TUDOAZUL',
      brandColor: '#003DA5',
      providerToFlexRate: 0.9,
      providerToFlexFeeBps: 200
    },
    {
      key: 'AADVANTAGE',
      displayName: 'AAdvantage',
      description: 'American Airlines rewards program',
      connectType: 'CREDENTIALS',
      supportedAssets: ['AADVANTAGE'],
      primaryAsset: 'AADVANTAGE',
      brandColor: '#0078D2',
      providerToFlexRate: 0.92,
      providerToFlexFeeBps: 220
    },
    {
      key: 'LIFEMILES',
      displayName: 'LifeMiles',
      description: 'Avianca rewards program',
      connectType: 'CREDENTIALS',
      supportedAssets: ['LIFEMILES'],
      primaryAsset: 'LIFEMILES',
      brandColor: '#C8102E',
      providerToFlexRate: 0.88,
      providerToFlexFeeBps: 240
    },
    {
      key: 'DOTZ',
      displayName: 'Dotz',
      description: 'Retail rewards program',
      connectType: 'CREDENTIALS',
      supportedAssets: ['DOTZ'],
      primaryAsset: 'DOTZ',
      brandColor: '#00B140',
      providerToFlexRate: 0.8,
      providerToFlexFeeBps: 300
    },
    {
      key: 'ESFERA',
      displayName: 'Esfera',
      description: 'Santander points program',
      connectType: 'CREDENTIALS',
      supportedAssets: ['ESFERA'],
      primaryAsset: 'ESFERA',
      brandColor: '#1A1A2E',
      providerToFlexRate: 0.96,
      providerToFlexFeeBps: 190
    },
    {
      key: 'IUPP',
      displayName: 'Iupp',
      description: 'Itaú points program',
      connectType: 'CREDENTIALS',
      supportedAssets: ['IUPP'],
      primaryAsset: 'IUPP',
      brandColor: '#FF3366',
      providerToFlexRate: 1.02,
      providerToFlexFeeBps: 170
    },
    {
      key: 'KM_DE_VANTAGENS',
      displayName: 'Km de Vantagens',
      description: 'Fuel and retail rewards program',
      connectType: 'MANUAL',
      supportedAssets: ['KM_DE_VANTAGENS'],
      primaryAsset: 'KM_DE_VANTAGENS',
      brandColor: '#00A651',
      providerToFlexRate: 0.75,
      providerToFlexFeeBps: 320
    },
    {
      key: 'ATOMOS_C6',
      displayName: 'Átomos C6',
      description: 'C6 bank points program',
      connectType: 'CREDENTIALS',
      supportedAssets: ['ATOMOS_C6'],
      primaryAsset: 'ATOMOS_C6',
      brandColor: '#2D2D2D',
      providerToFlexRate: 1.05,
      providerToFlexFeeBps: 180
    },
    {
      key: 'FIDELIDADE_123',
      displayName: 'Fidelidade 123',
      description: 'Marketplace loyalty program',
      connectType: 'MANUAL',
      supportedAssets: ['FIDELIDADE_123'],
      primaryAsset: 'FIDELIDADE_123',
      brandColor: '#FF6B00',
      providerToFlexRate: 0.7,
      providerToFlexFeeBps: 350
    },
    {
      key: 'FLEXMILES_INTERNAL',
      displayName: 'FlexMiles',
      description: 'Internal MilesUp asset',
      connectType: 'MANUAL',
      supportedAssets: ['FLEX_MILES'],
      primaryAsset: 'FLEX_MILES',
      brandColor: '#0F62FE',
      providerToFlexRate: 1,
      providerToFlexFeeBps: 0
    },
    {
      key: 'STRIPE',
      displayName: 'Stripe',
      description: 'Billing provider placeholder',
      connectType: 'OAUTH',
      supportedAssets: ['CASH'],
      primaryAsset: 'CASH',
      brandColor: '#635BFF',
      providerToFlexRate: 1,
      providerToFlexFeeBps: 0
    },
    {
      key: 'SECURITY_SANDBOX',
      displayName: 'Security Sandbox',
      description: 'Internal security provider placeholder',
      connectType: 'MANUAL',
      supportedAssets: ['FLEX_MILES'],
      primaryAsset: 'FLEX_MILES',
      brandColor: '#111827',
      providerToFlexRate: 1,
      providerToFlexFeeBps: 0
    }
  ];

  for (const provider of providers) {
    await prisma.provider.create({
      data: provider
    });
  }

  const freePlan = await prisma.subscriptionPlan.create({
    data: {
      code: 'FREE',
      name: 'MilesUp Free',
      description: 'Basic wallet, dashboard and account management.',
      country: 'BR',
      currency: 'BRL',
      monthlyAmountMinor: 0,
      yearlyAmountMinor: 0,
      highlighted: false,
      perks: ['Wallet overview', 'Provider connections', 'Basic history']
    }
  });

  const proPlan = await prisma.subscriptionPlan.create({
    data: {
      code: 'PRO',
      name: 'MilesUp Pro',
      description: 'Premium transfers, conversions and priority support.',
      country: 'BR',
      currency: 'BRL',
      monthlyAmountMinor: 2990,
      yearlyAmountMinor: 29900,
      highlighted: true,
      perks: ['Unlimited transfers', 'Priority support', 'Advanced insights']
    }
  });

  const alice = await prisma.user.create({
    data: {
      email: 'alice@milesup.app',
      name: 'Alice Mairink',
      phone: '+5511999991111',
      birthDate: new Date('1992-08-20T00:00:00.000Z'),
      cpf: '12345678901',
      role: 'USER',
      status: 'ACTIVE',
      flexKey: generateFlexKey({ name: 'Alice Mairink', email: 'alice@milesup.app' }),
      passwordHash,
      transactionPinHash: pinHash,
      wallet: {
        create: {
          balances: {
            create: [
              { asset: 'FLEX_MILES', amount: 42000 },
              { asset: 'LATAM_PASS', amount: 18000 },
              { asset: 'LIVELO', amount: 12000 },
              { asset: 'SMILES', amount: 9500 }
            ]
          }
        }
      }
    },
    include: {
      wallet: true
    }
  });

  const bruno = await prisma.user.create({
    data: {
      email: 'bruno@milesup.app',
      name: 'Bruno Rocha',
      phone: '+5511988882222',
      birthDate: new Date('1990-03-15T00:00:00.000Z'),
      cpf: '98765432100',
      role: 'USER',
      status: 'ACTIVE',
      flexKey: generateFlexKey({ name: 'Bruno Rocha', email: 'bruno@milesup.app' }),
      passwordHash,
      transactionPinHash: pinHash,
      wallet: {
        create: {
          balances: {
            create: [
              { asset: 'FLEX_MILES', amount: 16000 },
              { asset: 'SMILES', amount: 8000 }
            ]
          }
        }
      }
    },
    include: {
      wallet: true
    }
  });

  await prisma.providerConnection.createMany({
    data: [
      {
        userId: alice.id,
        providerKey: 'LATAM_PASS',
        externalAccountId: alice.email,
        email: alice.email,
        status: ConnectionStatus.CONNECTED,
        secretMasked: 'configured',
        lastSyncedAt: new Date()
      },
      {
        userId: alice.id,
        providerKey: 'LIVELO',
        externalAccountId: alice.email,
        email: alice.email,
        status: ConnectionStatus.CONNECTED,
        secretMasked: 'configured',
        lastSyncedAt: new Date()
      },
      {
        userId: bruno.id,
        providerKey: 'SMILES',
        externalAccountId: bruno.email,
        email: bruno.email,
        status: ConnectionStatus.CONNECTED,
        secretMasked: 'configured',
        lastSyncedAt: new Date()
      }
    ]
  });

  const aliceCard = await prisma.paymentMethod.create({
    data: {
      userId: alice.id,
      providerRef: 'pm_seed_alice',
      type: PaymentMethodType.CARD,
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: new Date().getFullYear() + 2,
      holderName: 'Alice Mairink',
      isDefault: true
    }
  });

  const proSubscription = await prisma.subscription.create({
    data: {
      userId: alice.id,
      planId: proPlan.id,
      status: SubscriptionStatus.ACTIVE,
      interval: BillingInterval.MONTH,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      nextAmountMinor: proPlan.monthlyAmountMinor,
      currency: 'BRL',
      paymentMethodId: aliceCard.id
    }
  });

  await prisma.subscription.create({
    data: {
      userId: bruno.id,
      planId: freePlan.id,
      status: SubscriptionStatus.FREE,
      nextAmountMinor: 0,
      currency: 'BRL'
    }
  });

  await prisma.invoice.createMany({
    data: [
      {
        userId: alice.id,
        subscriptionId: proSubscription.id,
        status: 'PAID',
        amountDueMinor: proPlan.monthlyAmountMinor,
        amountPaidMinor: proPlan.monthlyAmountMinor,
        amountRemainingMinor: 0,
        currency: 'BRL',
        hostedInvoiceUrl: 'https://app.milesup.com/invoices/seed-paid',
        invoicePdfUrl: 'https://app.milesup.com/invoices/seed-paid.pdf',
        dueDate: new Date(),
        periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        paidAt: new Date()
      },
      {
        userId: alice.id,
        subscriptionId: proSubscription.id,
        status: 'OPEN',
        amountDueMinor: proPlan.monthlyAmountMinor,
        amountPaidMinor: 0,
        amountRemainingMinor: proPlan.monthlyAmountMinor,
        currency: 'BRL',
        hostedInvoiceUrl: 'https://app.milesup.com/invoices/seed-open',
        invoicePdfUrl: 'https://app.milesup.com/invoices/seed-open.pdf',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    ]
  });

  const transfer = await prisma.transfer.create({
    data: {
      fromUserId: alice.id,
      fromWalletId: alice.wallet!.id,
      toUserId: bruno.id,
      toWalletId: bruno.wallet!.id,
      amountMiles: 3000,
      note: 'Seed transfer for dashboard history',
      usedSecurityMode: false,
      completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    }
  });

  const aliceLatamConnection = await prisma.providerConnection.findFirstOrThrow({
    where: {
      userId: alice.id,
      providerKey: 'LATAM_PASS'
    }
  });

  await prisma.conversion.create({
    data: {
      userId: alice.id,
      walletId: alice.wallet!.id,
      providerKey: 'LATAM_PASS',
      providerConnectionId: aliceLatamConnection.id,
      fromAsset: 'LATAM_PASS',
      toAsset: 'FLEX_MILES',
      amountInMiles: 5000,
      amountOutMiles: 5390,
      feeMiles: 110,
      rate: 1.1,
      note: 'Seed conversion for dashboard history',
      usedSecurityMode: false,
      completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
    }
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: alice.id,
        type: 'CONVERSION_COMPLETED',
        title: 'Conversion completed',
        body: '5,390 FlexMiles were added to your wallet.',
        actionUrl: '/transactions'
      },
      {
        userId: alice.id,
        type: 'TRANSFER_SENT',
        title: 'Transfer sent',
        body: '3,000 FlexMiles were sent to Bruno Rocha.',
        actionUrl: '/transactions'
      },
      {
        userId: bruno.id,
        type: 'TRANSFER_RECEIVED',
        title: 'Transfer received',
        body: '3,000 FlexMiles were received from Alice Mairink.',
        actionUrl: '/transactions'
      },
      {
        userId: alice.id,
        type: 'BILLING',
        title: 'Subscription active',
        body: 'Your MilesUp Pro plan is active.',
        actionUrl: '/subscriptions'
      }
    ]
  });

  await prisma.supportFaq.createMany({
    data: [
      {
        question: 'How do I connect a loyalty program?',
        answer: 'Open Programs, pick a provider and create a connection with your account identifier.',
        category: 'Connections',
        sortOrder: 1
      },
      {
        question: 'How do I convert miles into FlexMiles?',
        answer: 'Open Convert, choose one of your connected providers, review the preview and confirm with your PIN.',
        category: 'Conversions',
        sortOrder: 2
      },
      {
        question: 'Where can I manage my subscription?',
        answer: 'Open Plans or Subscription to review billing, invoices and your default payment method.',
        category: 'Billing',
        sortOrder: 3
      }
    ]
  });

  const conversation = await prisma.supportConversation.create({
    data: {
      userId: alice.id
    }
  });

  await prisma.supportMessage.createMany({
    data: [
      {
        conversationId: conversation.id,
        authorType: 'AGENT',
        authorName: 'MilesUp Support',
        body: 'Hi Alice! Welcome to MilesUp support. How can we help today?'
      },
      {
        conversationId: conversation.id,
        authorType: 'USER',
        authorName: 'Alice',
        body: 'I want to confirm whether my PRO plan is active.'
      },
      {
        conversationId: conversation.id,
        authorType: 'AGENT',
        authorName: 'MilesUp Support',
        body: 'Your PRO plan is active and your latest invoice was paid successfully.'
      }
    ]
  });

  await prisma.authSession.create({
    data: {
      userId: alice.id,
      deviceId: 'seed-device-alice',
      status: SessionStatus.ACTIVE,
      requiresTwoFactor: false,
      refreshTokenHash: hashRefreshToken('seed-refresh-token'),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      refreshExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      verifiedAt: new Date()
    }
  });

  console.log('Seed completed successfully.');
  console.log('Demo user 1: alice@milesup.app / Password#123 / PIN 654321');
  console.log('Demo user 2: bruno@milesup.app / Password#123 / PIN 654321');
  console.log(`Seed transfer id: ${transfer.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
