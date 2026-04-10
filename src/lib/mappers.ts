import type {
  Conversion,
  Invoice,
  Notification,
  PaymentMethod,
  Provider,
  ProviderConnection,
  Subscription,
  SubscriptionPlan,
  SupportMessage,
  Transfer,
  User,
  Wallet,
  WalletBalance
} from '@prisma/client';

import { toIsoString, toRequiredIsoString } from './formatters';

type UserWithAvatar = User & {
  profilePhotoAssetId: string | null;
};

export function mapUser(user: UserWithAvatar, appBaseUrl: string) {
  return {
    id: user.id,
    fullName: user.name,
    email: user.email,
    phone: user.phone,
    cpf: user.cpf,
    cnpj: user.cnpj,
    birthDate: toIsoString(user.birthDate),
    role: user.role,
    status: user.status,
    flexKey: user.flexKey,
    companyName: user.companyName,
    avatarUrl: user.profilePhotoAssetId ? `${appBaseUrl}/v1/media/${user.profilePhotoAssetId}` : null,
    createdAt: toRequiredIsoString(user.createdAt),
    updatedAt: toRequiredIsoString(user.updatedAt)
  };
}

export function mapWalletBalance(balance: WalletBalance) {
  return {
    asset: balance.asset,
    amount: balance.amount
  };
}

export function mapWallet(wallet: Wallet, balances: WalletBalance[]) {
  return {
    id: wallet.id,
    kind: wallet.kind,
    securityModeActive: wallet.securityModeActive,
    balances: balances.map(mapWalletBalance),
    createdAt: toRequiredIsoString(wallet.createdAt),
    updatedAt: toRequiredIsoString(wallet.updatedAt)
  };
}

export function mapProvider(provider: Provider) {
  return {
    key: provider.key,
    name: provider.displayName,
    description: provider.description,
    connectType: provider.connectType,
    supportedAssets: provider.supportedAssets,
    primaryAsset: provider.primaryAsset,
    brandColor: provider.brandColor,
    exchangeRateToFlex: Number(provider.providerToFlexRate),
    feeBps: provider.providerToFlexFeeBps
  };
}

export function mapProviderConnection(connection: ProviderConnection, provider: Provider) {
  return {
    id: connection.id,
    providerKey: connection.providerKey,
    providerName: provider.displayName,
    externalAccountId: connection.externalAccountId,
    status: connection.status,
    connectType: provider.connectType,
    supportedAssets: provider.supportedAssets,
    lastSyncedAt: toIsoString(connection.lastSyncedAt),
    connectedAt: toRequiredIsoString(connection.connectedAt),
    metadata: connection.metadata ?? null
  };
}

export function mapPaymentMethod(paymentMethod: PaymentMethod) {
  return {
    id: paymentMethod.id,
    providerRef: paymentMethod.providerRef,
    type: paymentMethod.type,
    brand: paymentMethod.brand,
    last4: paymentMethod.last4,
    expMonth: paymentMethod.expMonth,
    expYear: paymentMethod.expYear,
    holderName: paymentMethod.holderName,
    isDefault: paymentMethod.isDefault
  };
}

export function mapSubscription(
  subscription: Subscription,
  plan: SubscriptionPlan,
  paymentMethod: PaymentMethod | null
) {
  return {
    id: subscription.id,
    planCode: plan.code,
    planName: plan.name,
    status: subscription.status,
    interval: subscription.interval,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    currentPeriodStart: toIsoString(subscription.currentPeriodStart),
    currentPeriodEnd: toIsoString(subscription.currentPeriodEnd),
    nextBillingDate: toIsoString(subscription.nextBillingDate),
    nextAmountMinor: subscription.nextAmountMinor,
    currency: subscription.currency,
    paymentMethod: paymentMethod ? mapPaymentMethod(paymentMethod) : null,
    updatedAt: toRequiredIsoString(subscription.updatedAt)
  };
}

export function mapPlan(plan: SubscriptionPlan) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    country: plan.country,
    currency: plan.currency,
    monthlyAmountMinor: plan.monthlyAmountMinor,
    yearlyAmountMinor: plan.yearlyAmountMinor,
    highlighted: plan.highlighted,
    perks: plan.perks
  };
}

export function mapInvoice(invoice: Invoice) {
  return {
    id: invoice.id,
    status: invoice.status,
    amountDueMinor: invoice.amountDueMinor,
    amountPaidMinor: invoice.amountPaidMinor,
    amountRemainingMinor: invoice.amountRemainingMinor,
    currency: invoice.currency,
    hostedInvoiceUrl: invoice.hostedInvoiceUrl,
    invoicePdfUrl: invoice.invoicePdfUrl,
    dueDate: toRequiredIsoString(invoice.dueDate),
    periodStart: toRequiredIsoString(invoice.periodStart),
    periodEnd: toRequiredIsoString(invoice.periodEnd),
    paidAt: toIsoString(invoice.paidAt),
    createdAt: toRequiredIsoString(invoice.createdAt)
  };
}

export function mapNotification(notification: Notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    actionUrl: notification.actionUrl,
    status: notification.status,
    createdAt: toRequiredIsoString(notification.createdAt),
    readAt: toIsoString(notification.readAt)
  };
}

export function mapSupportMessage(message: SupportMessage) {
  return {
    id: message.id,
    authorType: message.authorType,
    authorName: message.authorName,
    body: message.body,
    createdAt: toRequiredIsoString(message.createdAt)
  };
}

export function mapTransferActivity(transfer: Transfer, currentUserId: string) {
  const direction: 'OUTGOING' | 'INCOMING' =
    transfer.fromUserId === currentUserId ? 'OUTGOING' : 'INCOMING';

  return {
    id: transfer.id,
    type: 'TRANSFER' as const,
    title: transfer.fromUserId === currentUserId ? 'Transfer sent' : 'Transfer received',
    direction,
    status: transfer.status,
    amountMiles: transfer.amountMiles,
    feeMiles: transfer.feeMiles,
    asset: 'FLEX_MILES',
    note: transfer.note,
    createdAt: toRequiredIsoString(transfer.createdAt)
  };
}

export function mapConversionActivity(conversion: Conversion) {
  return {
    id: conversion.id,
    type: 'CONVERSION' as const,
    title: `Converted ${conversion.providerKey} to FlexMiles`,
    direction: 'OUTGOING' as const,
    status: conversion.status,
    amountMiles: conversion.amountOutMiles,
    amountInMiles: conversion.amountInMiles,
    feeMiles: conversion.feeMiles,
    asset: conversion.toAsset,
    note: conversion.note,
    createdAt: toRequiredIsoString(conversion.createdAt)
  };
}
