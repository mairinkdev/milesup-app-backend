# Frontend to New Backend Migration

## Goal

This document explains how the existing MilesUp frontend should be reconnected to the new greenfield backend implemented in `C:\Users\Clara\OneDrive\Documents\mairink\milesup-app-backend`.

The key rule is:

- preserve the product and screens
- replace the old API contracts completely
- do not keep legacy endpoint compatibility in the backend

## Recommended integration order

1. Auth and session
2. Dashboard, wallet and providers
3. Transfer and conversion
4. Billing
5. Profile and account
6. Notifications and support

## Global frontend changes

These files should be updated before or during the screen migrations:

- `src/api/client.ts`
  - keep the auth headers if desired, but point requests to the new `/v1` routes
  - update refresh handling from `POST /refresh` to `POST /v1/auth/tokens/refresh`
  - update error parsing to the new format `{ error: { code, message, fieldErrors? } }`
- `src/api/types.ts`
  - replace legacy DTOs with the new API shapes
  - remove authenticated-body `userId` fields where the backend now infers the user from JWT
  - normalize list responses to `{ items, page, pageSize, totalItems, totalPages }`
- `src/api/auth/context.tsx`
  - swap all auth endpoints to `/v1/auth/*` and `/v1/users/me`
  - stop assuming login returns final session immediately when 2FA is required
  - use the new `temporaryToken + verificationId + code` flow
- `src/api/services/*`
  - update all endpoint paths and payloads
- `src/api/hooks/*`
  - update cache keys and response mapping to the new DTOs

## Route replacement summary

| Legacy route today | New route |
| --- | --- |
| `POST /login` | `POST /v1/auth/login` |
| `POST /2fa` | `POST /v1/auth/login/2fa` |
| `POST /refresh` | `POST /v1/auth/tokens/refresh` |
| `GET /me` | `GET /v1/users/me` |
| `POST /register/init` | `POST /v1/auth/register/start` |
| `POST /register/verify` | `POST /v1/auth/register/verify` |
| `POST /forgot` | `POST /v1/auth/password/forgot` |
| `POST /reset` | `POST /v1/auth/password/reset` |
| `GET /wallet/{userId}/summary` | `GET /v1/wallet` |
| `POST /wallet/reports/user-activity` | `GET /v1/wallet/activities` |
| `POST /wallet/security/start` | `POST /v1/wallet/security-mode` |
| `POST /wallet/security/end` | `DELETE /v1/wallet/security-mode` |
| `POST /wallet/transfer/recipient` | `POST /v1/transfers/recipient-resolution` |
| `POST /wallet/transfer/initiate` | `POST /v1/transfers/intents` |
| `POST /wallet/transfer/confirm` | `POST /v1/transfers/intents/:intentId/confirm` |
| `GET /providers/catalog` | `GET /v1/providers` |
| `GET /providers/detail/{providerKey}` | `GET /v1/providers/:providerKey` |
| `GET /providers/{userId}/connections` | `GET /v1/provider-connections` |
| `POST /providers/connect` | `POST /v1/provider-connections` |
| `POST /providers/disconnect` | `DELETE /v1/provider-connections/:connectionId` |
| `POST /conversions/intents` | `POST /v1/conversions/intents` |
| `POST /conversions/intents/confirm` | `POST /v1/conversions/intents/:intentId/confirm` |
| `GET /billing/plans/public` | `GET /v1/billing/plans` |
| `POST /billing/subscriptions/checkout/session` | `POST /v1/billing/checkout-sessions` |
| `GET /billing/subscriptions/me/public/{userId}` | `GET /v1/billing/subscription` |
| `GET /billing/invoices/list` | `GET /v1/billing/invoices` |
| `GET /billing/payment-methods/default` | `GET /v1/billing/payment-methods` |
| `POST /billing/payment-methods/default` | `PATCH /v1/billing/payment-methods/default` |
| `PATCH /auth/profile/basic` | `PATCH /v1/users/me` |
| `POST /auth/profile/photo` | `POST /v1/users/me/avatar` |

## Screen-by-screen migration

### `WelcomeScreen`

- Screen: `src/screens/auth/WelcomeScreen.tsx`
- Files to adjust: `src/api/auth/context.tsx` only if remembered-account logic or bootstrap changes are needed
- Legacy API today: none directly
- New API: none directly
- Migration note: no backend contract work is required for the screen itself
- Coverage: complete

### `LoginScreen`

- Screen: `src/screens/auth/LoginScreen.tsx`
- Files to adjust: `src/api/auth/context.tsx`, `src/api/types.ts`
- Legacy API today: `POST /login`, `GET /me`
- New API: `POST /v1/auth/login`, `POST /v1/auth/login/2fa`, `GET /v1/users/me`
- Payload changes:
  - login now sends `{ email, password, deviceId? }`
  - login response becomes `{ requiresTwoFactor, temporaryToken, verificationId, expiresAt, delivery, devCode? }`
- Response changes:
  - no final auth tokens are returned by `/login` when 2FA is required
  - final tokens come from `/v1/auth/login/2fa`
- Coverage: complete

### `RegisterScreen`

- Screen: `src/screens/auth/RegisterScreen.tsx`
- Files to adjust: `src/api/auth/context.tsx`, `src/api/types.ts`
- Legacy API today: `POST /register/init`, `POST /register/resend`, `POST /register/verify`
- New API: `POST /v1/auth/register/start`, `POST /v1/auth/register/verify`
- Payload changes:
  - registration start now includes `fullName`, `email`, `phone?`, `birthDate?`, `cpf?`, `cnpj?`, `role?`, `companyName?`, `password`, `pinCode`
  - there is no separate resend endpoint in the new backend yet; repeat `register/start` only if the UI truly needs re-issue behavior later
- Response changes:
  - start returns `{ verificationId, expiresAt, delivery, devCode? }`
  - verify returns the full auth session `{ accessToken, refreshToken, expiresAt, refreshExpiresAt, user }`
- Coverage: complete

### `ForgotPasswordScreen`

- Screen: `src/screens/auth/ForgotPasswordScreen.tsx`
- Files to adjust: `src/api/auth/context.tsx`, `src/api/types.ts`
- Legacy API today: `POST /forgot`
- New API: `POST /v1/auth/password/forgot`
- Payload changes: request remains `{ email }`
- Response changes: returns `{ verificationId, expiresAt, delivery, devCode? }`
- Coverage: complete

### `ResetPasswordScreen`

- Screen: `src/screens/auth/ResetPasswordScreen.tsx`
- Files to adjust: `src/api/auth/context.tsx`, `src/api/types.ts`
- Legacy API today: `POST /reset`
- New API: `POST /v1/auth/password/reset`
- Payload changes: now send `{ verificationId, code, newPassword }`
- Response changes: returns `{ ok, message }`
- Coverage: complete

### `TwoFactorScreen`

- Screen: `src/screens/auth/TwoFactorScreen.tsx`
- Files to adjust: `src/api/auth/context.tsx`, `src/api/types.ts`
- Legacy API today: `POST /2fa`
- New API: `POST /v1/auth/login/2fa`
- Payload changes: now send `{ temporaryToken, verificationId, code }`
- Response changes: returns the final auth session `{ accessToken, refreshToken, expiresAt, refreshExpiresAt, user }`
- Coverage: complete

### `DashboardScreen`

- Screen: `src/screens/core/DashboardScreen.tsx`
- Files to adjust: `src/api/services/wallet.ts`, `src/api/hooks/useWallet.ts`, `src/api/services/providers.ts`, `src/api/hooks/useProviders.ts`, `src/api/types.ts`
- Legacy API today:
  - `GET /wallet/{userId}/summary`
  - `POST /wallet/reports/user-activity`
  - `GET /providers/{userId}/connections`
- New API:
  - `GET /v1/dashboard`
  - `GET /v1/provider-connections`
- Payload/query changes:
  - dashboard query is now `period=7d|15d|30d|90d`
  - user ID no longer travels in request params for authenticated reads
- Response changes:
  - dashboard is now a single aggregate with `{ wallet, metrics, connectedProviders, recentActivities, subscription }`
- Coverage: complete

### `PlansScreen`

- Screen: `src/screens/core/PlansScreen.tsx`
- Files to adjust: `src/api/services/billing.ts`, `src/api/hooks/useBilling.ts`, `src/api/types.ts`
- Legacy API today:
  - `GET /billing/plans/public?country=BR`
  - `GET /billing/subscriptions/me/public/{userId}`
  - `GET /billing/invoices/list?userId=...&limit=...`
- New API:
  - `GET /v1/billing/plans?country=BR`
  - `GET /v1/billing/subscription`
  - `GET /v1/billing/invoices?page=1&pageSize=10`
- Response changes:
  - plans return `{ items: Plan[] }`
  - subscription now includes `planCode`, `planName`, `interval`, `paymentMethod`
  - invoices now use pagination envelope
- Coverage: complete

### `ConvertMilesScreen`

- Screen: `src/screens/core/ConvertMilesScreen.tsx`
- Files to adjust: `src/api/services/conversions.ts`, `src/api/hooks/useConversions.ts`, `src/api/services/providers.ts`, `src/api/hooks/useProviders.ts`, `src/api/types.ts`
- Legacy API today:
  - `GET /providers/{userId}/connections`
  - `POST /conversions/intents`
  - `POST /conversions/intents/confirm`
- New API:
  - `GET /v1/provider-connections`
  - `POST /v1/conversions/intents`
  - `POST /v1/conversions/intents/:intentId/confirm`
- Payload changes:
  - intent creation now sends `{ providerConnectionId, amountMiles, note? }`
  - confirm now sends `{ pinCode }`
- Response changes:
  - intent returns `{ id, providerConnectionId, providerKey, amountInMiles, amountOutMiles, feeMiles, rate, expiresAt, note }`
  - confirmation returns `{ conversion, walletBalance }`
- Coverage: complete

### `ConnectProgramsScreen`

- Screen: `src/screens/core/ConnectProgramsScreen.tsx`
- Files to adjust: `src/api/services/providers.ts`, `src/api/hooks/useProviders.ts`, `src/api/types.ts`, `src/features/programs/components/ProviderConnectionForm.tsx`
- Legacy API today:
  - `GET /providers/catalog`
  - `GET /providers/{userId}/connections`
  - `POST /providers/connect`
  - `POST /providers/disconnect`
- New API:
  - `GET /v1/providers`
  - `GET /v1/provider-connections`
  - `POST /v1/provider-connections`
  - `DELETE /v1/provider-connections/:connectionId`
- Payload changes:
  - connect now sends `{ providerKey, externalAccountId, email?, secret?, metadata? }`
  - disconnect is path-based, no request body
- Response changes:
  - catalog entries are richer and no longer need the current frontend fallback normalizer
  - connections return `{ items: [...] }`
- Coverage: complete

### `AccountScreen`

- Screen: `src/screens/core/AccountScreen.tsx`
- Files to adjust: `src/api/hooks/useBilling.ts`, `src/api/hooks/useWallet.ts`, `src/api/hooks/useProviders.ts`, `src/api/auth/context.tsx`
- Legacy API today:
  - `GET /billing/subscriptions/me/public/{userId}`
  - `GET /wallet/{userId}/summary`
  - `GET /providers/{userId}/connections`
  - `POST /logout`
- New API:
  - `GET /v1/billing/subscription`
  - `GET /v1/wallet`
  - `GET /v1/provider-connections`
  - `POST /v1/auth/logout`
- Response changes:
  - subscription, wallet and connections become cleaner direct resources
  - logout still returns `{ ok: true }`
- Coverage: complete

### `ProfileScreen`

- Screen: `src/screens/core/ProfileScreen.tsx`
- Files to adjust: `src/api/services/profile.ts`, `src/api/hooks/useProfile.ts`, `src/api/types.ts`
- Legacy API today:
  - `PATCH /auth/profile/basic`
  - `POST /auth/profile/photo`
  - `GET /me`
- New API:
  - `PATCH /v1/users/me`
  - `POST /v1/users/me/avatar`
  - `GET /v1/users/me`
- Payload changes:
  - profile patch now sends `{ fullName?, phone?, companyName? }`
  - avatar upload no longer needs `userId` appended to the form data
- Response changes:
  - all user profile writes return the new `me`-style user shape
- Coverage: complete

### `WalletSecurityScreen`

- Screen: `src/screens/core/WalletSecurityScreen.tsx`
- Files to adjust: `src/api/services/wallet.ts`, `src/api/hooks/useWallet.ts`, `src/api/types.ts`
- Legacy API today:
  - `GET /wallet/{userId}/summary`
  - `POST /wallet/security/start`
  - `POST /wallet/security/end`
- New API:
  - `GET /v1/wallet`
  - `POST /v1/wallet/security-mode`
  - `DELETE /v1/wallet/security-mode`
- Payload changes:
  - start may optionally send `{ reason? }`
  - end has no body
- Response changes:
  - start returns `{ active, startedAt, reason }`
  - end returns `{ active, endedAt }`
- Coverage: complete

### `TransferMilesScreen`

- Screen: `src/screens/auxiliary/TransferMilesScreen.tsx`
- Files to adjust: `src/api/services/wallet.ts`, `src/api/hooks/useWallet.ts`, `src/api/types.ts`
- Legacy API today:
  - `POST /wallet/transfer/recipient`
  - `POST /wallet/transfer/initiate`
  - `POST /wallet/transfer/confirm`
- New API:
  - `POST /v1/transfers/recipient-resolution`
  - `POST /v1/transfers/intents`
  - `POST /v1/transfers/intents/:intentId/confirm`
- Payload changes:
  - recipient resolution now sends `{ query }`
  - intent creation now sends `{ recipientHandleOrEmail, amountMiles, note? }`
  - confirm now sends `{ pinCode }`
- Response changes:
  - recipient returns `{ userId, walletId, displayName, handle, avatarUrl }`
  - intent returns `{ id, amountMiles, feeMiles, expiresAt, recipient, note }`
  - confirm returns `{ transfer, walletBalance }`
- Coverage: complete

### `BuyMilesScreen`

- Screen: `src/screens/auxiliary/BuyMilesScreen.tsx`
- Files to adjust: `src/api/services/billing.ts`, `src/api/hooks/useBilling.ts`, `src/api/types.ts`, `src/lib/appUrls.ts` if redirects are refined
- Legacy API today:
  - `GET /billing/plans/public`
  - `POST /billing/subscriptions/checkout/session`
- New API:
  - `GET /v1/billing/plans`
  - `POST /v1/billing/checkout-sessions`
- Payload changes:
  - checkout creation now sends `{ planCode, interval, successRedirectUrl, cancelRedirectUrl, email? }`
  - `userId` and `country` are no longer required in the authenticated body
- Response changes:
  - response is `{ id, url, expiresAt }`
- Coverage: complete

### `FlexMilesInfoScreen`

- Screen: `src/screens/auxiliary/FlexMilesInfoScreen.tsx`
- Files to adjust: none
- Legacy API today: none
- New API: none
- Migration note: editorial static screen
- Coverage: not applicable

### `SupportScreen`

- Screen: `src/screens/auxiliary/SupportScreen.tsx`
- Files to adjust: this screen should stop using only local FAQ data and call a new service/hook pair, for example `src/api/services/support.ts` and `src/api/hooks/useSupport.ts`
- Legacy API today: none, static FAQ and support links
- New API:
  - `GET /v1/support/faqs`
  - `GET /v1/support/conversation`
- Response changes:
  - FAQ becomes server-backed `{ items: [...] }`
  - the support hub can also preload the existing conversation snapshot
- Coverage: complete

### `SupportChatScreen`

- Screen: `src/screens/auxiliary/SupportChatScreen.tsx`
- Files to adjust: create `src/api/services/support.ts`, `src/api/hooks/useSupport.ts`, update this screen to stop using local `setTimeout`
- Legacy API today: none, chat is simulated locally
- New API:
  - `GET /v1/support/conversation`
  - `POST /v1/support/conversation/messages`
- Payload changes:
  - send `{ message }`
- Response changes:
  - message post returns `{ conversationId, messages }`
- Coverage: complete

### `NotificationsScreen`

- Screen: `src/screens/auxiliary/NotificationsScreen.tsx`
- Files to adjust: create `src/api/services/notifications.ts`, `src/api/hooks/useNotifications.ts`, update the screen to stop deriving notifications from wallet activity
- Legacy API today: no notifications endpoint, screen derives data from `useUserActivity`
- New API:
  - `GET /v1/notifications?page=1&pageSize=20`
  - `POST /v1/notifications/read-all`
- Response changes:
  - notifications now come from a dedicated paginated resource
  - mark-all-read returns `{ updatedCount }`
- Coverage: complete

### `TransactionsScreen`

- Screen: `src/screens/auxiliary/TransactionsScreen.tsx`
- Files to adjust: `src/api/services/wallet.ts`, `src/api/hooks/useWallet.ts`, `src/api/types.ts`
- Legacy API today: `POST /wallet/reports/user-activity`
- New API: `GET /v1/wallet/activities`
- Query changes:
  - use query string instead of body: `period`, `kind`, `direction`, `page`, `pageSize`
  - authenticated user is inferred from token
- Response changes:
  - returns `{ items, summary, page, pageSize, totalItems, totalPages }`
- Coverage: complete

### `SubscriptionsScreen`

- Screen: `src/screens/auxiliary/SubscriptionsScreen.tsx`
- Files to adjust: `src/api/services/billing.ts`, `src/api/hooks/useBilling.ts`, `src/api/types.ts`
- Legacy API today:
  - `GET /billing/subscriptions/me/public/{userId}`
  - `GET /billing/invoices/list`
- New API:
  - `GET /v1/billing/subscription`
  - `GET /v1/billing/invoices`
  - optionally later `POST /v1/billing/subscription/cancel` and `POST /v1/billing/subscription/change-plan`
- Response changes:
  - subscription DTO is richer and explicit about plan and interval
  - invoices are paginated
- Coverage: complete

### `PaymentMethodsScreen`

- Screen: `src/screens/core/PaymentMethodsScreen.tsx`
- Files to adjust: `src/api/services/billing.ts`, `src/api/hooks/useBilling.ts`, `src/api/types.ts`
- Legacy API today:
  - `GET /billing/payment-methods/default?userId=...`
  - `POST /billing/payment-methods/default`
- New API:
  - `GET /v1/billing/payment-methods`
  - `PATCH /v1/billing/payment-methods/default`
- Payload changes:
  - default change now sends `{ paymentMethodId }`
  - user ID is not sent anymore
- Response changes:
  - list returns `{ items, defaultPaymentMethodId }`
  - patch returns the updated payment method object
- Coverage: complete

### `TransferSuccessScreen`

- Screen: `src/screens/auxiliary/TransferSuccessScreen.tsx`
- Files to adjust: only if the screen depends on route params from the previous transfer result
- Legacy API today: indirect dependency on transfer confirm response
- New API: indirect dependency on `POST /v1/transfers/intents/:intentId/confirm`
- Migration note: update any success payload mapping to use `transfer.id`, `transfer.amountMiles` and `walletBalance.amount`
- Coverage: complete

### `ErrorFallbackScreen`

- Screen: `src/screens/auxiliary/ErrorFallbackScreen.tsx`
- Files to adjust: optional only
- Legacy API today: none
- New API: none
- Migration note: if desired, improve displayed messages using `error.code` and `error.message` from the new backend
- Coverage: not applicable

### `DesignSystemScreen`

- Screen: `src/screens/dev/DesignSystemScreen.tsx`
- Files to adjust: none
- Legacy API today: none
- New API: none
- Migration note: dev-only showcase
- Coverage: not applicable

### `mvp-start`

- Screen: launcher alias in `src/app/registry/screenRegistry.tsx`
- Files to adjust: none
- Legacy API today: none
- New API: none
- Migration note: preview infrastructure only
- Coverage: not applicable

## Suggested implementation checklist

### Phase 1: auth

- [ ] Update `src/api/auth/context.tsx` to the new `/v1/auth/*` routes
- [ ] Update `/me` usage to `/v1/users/me`
- [ ] Update refresh flow to `/v1/auth/tokens/refresh`
- [ ] Replace legacy register and password-reset DTOs

### Phase 2: dashboard, wallet and providers

- [ ] Replace wallet summary service with `GET /v1/wallet`
- [ ] Replace activity report service with `GET /v1/wallet/activities`
- [ ] Add dashboard aggregate service for `GET /v1/dashboard`
- [ ] Replace provider catalog and connection services with `/v1/providers` and `/v1/provider-connections`

### Phase 3: transfer and conversion

- [ ] Replace recipient resolution, transfer intent and transfer confirm services
- [ ] Replace conversion intent and confirm services
- [ ] Remove authenticated `userId` from those request bodies

### Phase 4: billing

- [ ] Replace plans, subscription, invoices and payment-method endpoints
- [ ] Update checkout creation to the new hosted checkout contract
- [ ] Update cancel/switch hooks if those screens become active

### Phase 5: profile and account

- [ ] Replace profile patch and avatar upload routes
- [ ] Remove multipart `userId` from avatar upload

### Phase 6: notifications and support

- [ ] Create dedicated notification services/hooks
- [ ] Create dedicated support services/hooks
- [ ] Stop deriving notifications from wallet activity
- [ ] Stop simulating support chat locally

## Coverage status

Every product-relevant screen in the current frontend now has a real backend destination in the new API. The remaining work is frontend integration, not backend implementation.
