import type { Prisma, PrismaClient } from '@prisma/client'

import { prisma } from './prisma'

type ProviderCatalogClient = Pick<PrismaClient, 'provider'>

export const providerCatalog = [
  {
    key: 'LATAM_PASS',
    displayName: 'LATAM Pass',
    description: 'LATAM Airlines loyalty program',
    connectType: 'CREDENTIALS',
    supportedAssets: ['LATAM_PASS'],
    primaryAsset: 'LATAM_PASS',
    brandColor: '#E4002B',
    providerToFlexRate: 1.1,
    providerToFlexFeeBps: 200,
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
    providerToFlexFeeBps: 250,
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
    providerToFlexFeeBps: 180,
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
    providerToFlexFeeBps: 200,
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
    providerToFlexFeeBps: 220,
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
    providerToFlexFeeBps: 240,
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
    providerToFlexFeeBps: 300,
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
    providerToFlexFeeBps: 190,
  },
  {
    key: 'IUPP',
    displayName: 'Iupp',
    description: 'Itau points program',
    connectType: 'CREDENTIALS',
    supportedAssets: ['IUPP'],
    primaryAsset: 'IUPP',
    brandColor: '#FF3366',
    providerToFlexRate: 1.02,
    providerToFlexFeeBps: 170,
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
    providerToFlexFeeBps: 320,
  },
  {
    key: 'ATOMOS_C6',
    displayName: 'Atomos C6',
    description: 'C6 bank points program',
    connectType: 'CREDENTIALS',
    supportedAssets: ['ATOMOS_C6'],
    primaryAsset: 'ATOMOS_C6',
    brandColor: '#2D2D2D',
    providerToFlexRate: 1.05,
    providerToFlexFeeBps: 180,
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
    providerToFlexFeeBps: 350,
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
    providerToFlexFeeBps: 0,
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
    providerToFlexFeeBps: 0,
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
    providerToFlexFeeBps: 0,
  },
] satisfies Prisma.ProviderCreateInput[]

let catalogInitPromise: Promise<void> | null = null

async function ensureProviderCatalogInternal(client: ProviderCatalogClient) {
  const existingProviders = await client.provider.findMany({
    select: { key: true },
  })
  const existingKeys = new Set(existingProviders.map((provider) => provider.key))

  for (const provider of providerCatalog) {
    if (!existingKeys.has(provider.key)) {
      await client.provider.create({ data: provider })
    }
  }
}

export function ensureProviderCatalog(client: ProviderCatalogClient = prisma) {
  if (client !== prisma) {
    return ensureProviderCatalogInternal(client)
  }

  if (!catalogInitPromise) {
    catalogInitPromise = ensureProviderCatalogInternal(client).catch((error) => {
      catalogInitPromise = null
      throw error
    })
  }

  return catalogInitPromise
}
