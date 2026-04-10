-- DeleteMany users with duplicate/test emails to clean up
DELETE FROM "User" WHERE email = 'me@mairink.com';

-- CreateTable Providers if not exists
INSERT INTO "Provider" (id, key, "displayName", description, "connectType", "supportedAssets", "primaryAsset", "brandColor", "providerToFlexRate", "providerToFlexFeeBps", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'LATAM_PASS', 'LATAM Pass', 'LATAM Airlines loyalty program', 'CREDENTIALS', ARRAY['LATAM_PASS'], 'LATAM_PASS', '#E4002B', 1.1, 200, NOW(), NOW()),
  (gen_random_uuid(), 'LIVELO', 'Livelo', 'Multi-partner points program', 'CREDENTIALS', ARRAY['LIVELO'], 'LIVELO', '#6B2D8B', 1.0, 250, NOW(), NOW()),
  (gen_random_uuid(), 'SMILES', 'Smiles', 'GOL Airlines rewards program', 'CREDENTIALS', ARRAY['SMILES'], 'SMILES', '#FF6600', 0.95, 180, NOW(), NOW()),
  (gen_random_uuid(), 'TUDOAZUL', 'TudoAzul', 'Azul airline loyalty points', 'CREDENTIALS', ARRAY['TUDOAZUL'], 'TUDOAZUL', '#003DA5', 0.9, 200, NOW(), NOW()),
  (gen_random_uuid(), 'AADVANTAGE', 'AAdvantage', 'American Airlines rewards program', 'CREDENTIALS', ARRAY['AADVANTAGE'], 'AADVANTAGE', '#0078D2', 0.92, 220, NOW(), NOW()),
  (gen_random_uuid(), 'LIFEMILES', 'LifeMiles', 'Avianca rewards program', 'CREDENTIALS', ARRAY['LIFEMILES'], 'LIFEMILES', '#C8102E', 0.88, 240, NOW(), NOW()),
  (gen_random_uuid(), 'DOTZ', 'Dotz', 'Retail rewards program', 'CREDENTIALS', ARRAY['DOTZ'], 'DOTZ', '#00B140', 0.8, 300, NOW(), NOW()),
  (gen_random_uuid(), 'ESFERA', 'Esfera', 'Santander points program', 'CREDENTIALS', ARRAY['ESFERA'], 'ESFERA', '#1A1A2E', 0.96, 190, NOW(), NOW()),
  (gen_random_uuid(), 'IUPP', 'Iupp', 'Itaú points program', 'CREDENTIALS', ARRAY['IUPP'], 'IUPP', '#FF3366', 1.02, 170, NOW(), NOW()),
  (gen_random_uuid(), 'KM_DE_VANTAGENS', 'Km de Vantagens', 'Fuel and retail rewards program', 'MANUAL', ARRAY['KM_DE_VANTAGENS'], 'KM_DE_VANTAGENS', '#00A651', 0.75, 320, NOW(), NOW()),
  (gen_random_uuid(), 'ATOMOS_C6', 'Átomos C6', 'C6 bank points program', 'CREDENTIALS', ARRAY['ATOMOS_C6'], 'ATOMOS_C6', '#2D2D2D', 1.05, 180, NOW(), NOW()),
  (gen_random_uuid(), 'FIDELIDADE_123', 'Fidelidade 123', 'Marketplace loyalty program', 'MANUAL', ARRAY['FIDELIDADE_123'], 'FIDELIDADE_123', '#FF6B00', 0.7, 350, NOW(), NOW()),
  (gen_random_uuid(), 'FLEXMILES_INTERNAL', 'FlexMiles', 'Internal MilesUp asset', 'MANUAL', ARRAY['FLEX_MILES'], 'FLEX_MILES', '#0F62FE', 1, 0, NOW(), NOW()),
  (gen_random_uuid(), 'STRIPE', 'Stripe', 'Billing provider placeholder', 'OAUTH', ARRAY['CASH'], 'CASH', '#635BFF', 1, 0, NOW(), NOW()),
  (gen_random_uuid(), 'SECURITY_SANDBOX', 'Security Sandbox', 'Internal security provider placeholder', 'MANUAL', ARRAY['FLEX_MILES'], 'FLEX_MILES', '#111827', 1, 0, NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

-- CreateTable SubscriptionPlans - FREE and PRO
INSERT INTO "SubscriptionPlan" (id, code, name, description, country, currency, "monthlyAmountMinor", "yearlyAmountMinor", highlighted, perks, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'FREE', 'MilesUp Free', 'Basic wallet, dashboard and account management.', 'BR', 'BRL', 0, 0, false, ARRAY['Wallet overview', 'Provider connections', 'Basic history', 'Standard fees on transfers'], NOW(), NOW()),
  (gen_random_uuid(), 'PRO', 'MilesUp Pro', 'Premium features with real discounts and reduced fees.', 'BR', 'BRL', 2990, 29900, true, ARRAY['Unlimited transfers', '15% discount on FlexMiles purchases', '50% reduced transfer fees', 'Priority support', 'Advanced analytics', 'Real-time notifications'], NOW(), NOW())
ON CONFLICT (code, country) DO NOTHING;
