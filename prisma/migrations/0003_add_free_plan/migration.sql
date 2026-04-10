-- DeleteMany users with duplicate/test emails to clean up
DELETE FROM "User" WHERE email = 'me@mairink.com';

-- CreateTable SubscriptionPlan FREE if not exists
INSERT INTO "SubscriptionPlan" (id, code, name, description, country, currency, "monthlyAmountMinor", "yearlyAmountMinor", highlighted, perks, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'FREE',
  'MilesUp Free',
  'Basic wallet, dashboard and account management.',
  'BR',
  'BRL',
  0,
  0,
  false,
  ARRAY['Wallet overview', 'Provider connections', 'Basic history'],
  NOW(),
  NOW()
)
ON CONFLICT (code, country) DO NOTHING;
