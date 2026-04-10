# Backend Implementation Summary

## Overview

This repository contains a fully new MilesUp backend built greenfield in `C:\Users\Clara\OneDrive\Documents\mairink\milesup-app-backend`. No legacy backend routes, schemas, migrations, controllers, services or compatibility layers were preserved. The backend was designed from the product needs expressed by the frontend screens and by `FRONTEND_CONTEXT_COMPLETE.md`, not from the previous API shape.

The result is a new `/v1` REST API that supports the real product flows end to end:

- authentication and session lifecycle
- user profile and avatar upload
- wallet summary and activity feed
- provider catalog and user connections
- transfers between MilesUp users
- conversions from provider balances to `FlexMiles`
- plans, subscription, invoices and payment methods
- hosted checkout for MVP billing
- notifications and support conversation

## Chosen stack

- Node.js 20+
- TypeScript
- Fastify
- PostgreSQL
- Prisma ORM
- Zod
- JWT
- bcryptjs
- dotenv
- Swagger / OpenAPI
- Vitest for integration coverage

## Folder structure

```text
src/
  app.ts
  server.ts
  config/
    env.ts
  lib/
    activity.ts
    auth.ts
    billing.ts
    errors.ts
    formatters.ts
    http.ts
    mappers.ts
    notifications.ts
    prisma.ts
    verification.ts
  modules/
    auth/
    billing/
    conversions/
    dashboard/
    media/
    notifications/
    providers/
    support/
    transfers/
    users/
    wallet/
    index.ts
  plugins/
    auth.ts
    cors.ts
    multipart.ts
    swagger.ts
  types/
prisma/
  schema.prisma
  seed.ts
  migrations/
tests/
  api.test.ts
```

## Core domain entities

The Prisma schema was modeled from zero and currently includes:

- `User`
- `AuthSession`
- `VerificationCode`
- `Wallet`
- `WalletBalance`
- `Provider`
- `ProviderConnection`
- `TransferIntent`
- `Transfer`
- `ConversionIntent`
- `Conversion`
- `SubscriptionPlan`
- `Subscription`
- `Invoice`
- `PaymentMethod`
- `CheckoutSession`
- `Notification`
- `SupportFaq`
- `SupportConversation`
- `SupportMessage`
- `MediaAsset`
- `SecurityModeSession`

Important modeling choices:

- all public IDs are UUIDs
- wallet and provider balances are stored as integers
- monetary values use `amountMinor` plus `currency`
- auth sessions persist refresh-token hashes per device/session
- verification codes are persisted and hashed, not mocked
- hosted checkout sessions are persisted and can be completed or cancelled

## Implemented API modules

### Auth and users

- `POST /v1/auth/register/start`
- `POST /v1/auth/register/verify`
- `POST /v1/auth/login`
- `POST /v1/auth/login/2fa`
- `POST /v1/auth/tokens/refresh`
- `POST /v1/auth/logout`
- `POST /v1/auth/password/forgot`
- `POST /v1/auth/password/reset`
- `GET /v1/users/me`
- `PATCH /v1/users/me`
- `POST /v1/users/me/avatar`

### Wallet and dashboard

- `GET /v1/dashboard`
- `GET /v1/wallet`
- `GET /v1/wallet/activities`
- `POST /v1/wallet/security-mode`
- `DELETE /v1/wallet/security-mode`

### Providers

- `GET /v1/providers`
- `GET /v1/providers/:providerKey`
- `GET /v1/provider-connections`
- `POST /v1/provider-connections`
- `DELETE /v1/provider-connections/:connectionId`

### Transfers and conversions

- `POST /v1/transfers/recipient-resolution`
- `POST /v1/transfers/intents`
- `POST /v1/transfers/intents/:intentId/confirm`
- `POST /v1/conversions/intents`
- `POST /v1/conversions/intents/:intentId/confirm`

### Billing

- `GET /v1/billing/plans`
- `GET /v1/billing/subscription`
- `POST /v1/billing/checkout-sessions`
- `GET /v1/billing/invoices`
- `GET /v1/billing/payment-methods`
- `PATCH /v1/billing/payment-methods/default`
- `POST /v1/billing/subscription/cancel`
- `POST /v1/billing/subscription/change-plan`

Hosted checkout:

- `GET /checkout/:publicToken`
- `GET /checkout/:publicToken/complete`
- `GET /checkout/:publicToken/cancel`

### Notifications, support and media

- `GET /v1/notifications`
- `POST /v1/notifications/read-all`
- `GET /v1/support/faqs`
- `GET /v1/support/conversation`
- `POST /v1/support/conversation/messages`
- `GET /v1/media/:mediaId`
- `GET /health`

## Authentication that was implemented

The new auth model is deliberately simple and practical for MVP validation:

- email + password login
- registration start + email verification code
- login 2FA by persisted verification code
- JWT access tokens
- persisted refresh sessions with hashed refresh tokens
- password hashing with bcrypt
- wallet transaction PIN hashing with bcrypt
- `GET /v1/users/me` as the canonical authenticated user snapshot
- logout by revoking the current session

Development-friendly behavior:

- verification codes can be exposed in responses when `EXPOSE_DEV_CODES=true`
- the delivery adapter is intentionally simple and logs/persists the verification step instead of requiring a heavy external mail provider

## Integrations implemented

- PostgreSQL via Prisma
- Swagger/OpenAPI UI at `/docs`
- multipart avatar upload via Fastify multipart
- hosted checkout pages rendered by the backend itself
- a minimal notification adapter backed by database records

Integrations intentionally kept lightweight for MVP:

- no external payment gateway SDK
- no external email provider requirement
- no storage bucket dependency
- no websocket or queue infrastructure

## Product flows covered

Covered directly by real persistence and real endpoints:

- welcome to login
- multi-step registration with verification code
- forgot/reset password
- login with 2FA
- session refresh and logout
- dashboard aggregation
- wallet summary and activity history
- provider connection management
- conversion intent and confirmation
- transfer intent and confirmation
- wallet security mode start/end
- plans and subscription overview
- hosted checkout for subscription upgrade
- invoice and payment-method listing
- default payment-method selection
- profile update and avatar upload
- notifications list and read-all
- support FAQ and support conversation

## Seeds included

The seed populates the app with enough data to open the product immediately after setup:

- provider catalog
- FREE and PRO plans
- demo users `alice@milesup.app` and `bruno@milesup.app`
- wallet balances including `FlexMiles` and provider balances
- provider connections
- active PRO subscription, payment method and invoices
- transfer and conversion history
- notifications
- support FAQ and conversation

Demo credentials:

- `alice@milesup.app` / `Password#123` / PIN `654321`
- `bruno@milesup.app` / `Password#123` / PIN `654321`

## Compatibility decisions made for the frontend

The backend was intentionally not made compatible with the old frontend API. Instead, it was shaped around the real product needs and the migration will happen in the frontend afterwards.

Main compatibility decisions:

- API is versioned under `/v1`
- response JSON uses `camelCase`
- list responses use `{ items, page, pageSize, totalItems, totalPages }`
- object endpoints return direct objects, not nested envelopes
- errors follow `{ error: { code, message, fieldErrors? } }`
- `FlexMiles` operations now use explicit transfer and conversion intent resources
- billing is normalized around plans, subscription snapshot, invoices and payment methods
- notifications and support stopped being local-only concerns and now have persistence

## Validation, error handling and docs

- Zod request validation is active across modules
- Fastify error handling returns coherent HTTP codes and predictable error bodies
- Swagger UI is enabled at `/docs`
- environment validation happens at startup through `src/config/env.ts`
- healthcheck pings the database through `GET /health`

## Testing and verification status

Validated in this repository:

- `npm run typecheck`
- `npm run build`
- `npm test`

Testing note:

- the integration suite exists in `tests/api.test.ts`
- on Windows it is skipped by default unless `TEST_DATABASE_URL` is configured, because embedded Postgres is unreliable in this environment
- on non-Windows or with a dedicated test database, the suite exercises auth, dashboard, providers, transfers, conversions, billing, notifications and support

## Railway readiness

Railway-related deliverables included:

- `.env.example`
- `Dockerfile`
- `README.md`
- Prisma migrations
- seed script
- app listening on `process.env.PORT`
- production-safe startup through `npx prisma migrate deploy && node dist/server.js`

## Remaining gaps

Nothing central was left as a route skeleton or TODO, but a few deliberate MVP simplifications remain:

- email delivery is a lightweight dev adapter, not a full provider integration
- hosted checkout is first-party and simple, not Stripe-powered
- avatar storage is in PostgreSQL bytes, not cloud object storage
- support replies are auto-generated acknowledgements, not an agent console
- notifications are generated from backend operations, not push infrastructure

Those are practical MVP tradeoffs, not missing core backend flows.
