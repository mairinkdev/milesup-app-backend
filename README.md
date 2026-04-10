# MilesUp Backend

Greenfield backend for the MilesUp application, rebuilt from zero to support the real frontend product flows with a new `/v1` REST API, PostgreSQL persistence, hosted checkout pages, Swagger docs and Railway-ready deployment.

## Stack

- Node.js 20+
- TypeScript
- Fastify
- PostgreSQL
- Prisma ORM
- Zod
- JWT
- bcryptjs
- Swagger / OpenAPI

## What is implemented

- Auth with registration, email verification, login, 2FA, refresh token, logout and password reset
- User profile with `GET /v1/users/me`, profile update and avatar upload
- Wallet summary, activity feed and security mode
- Provider catalog and provider connections
- Transfer intents and confirmation with PIN
- Conversion intents and confirmation with PIN
- Billing plans, subscription snapshot, payment methods, invoices and hosted checkout
- Notifications, support FAQ and support conversation
- Media serving and healthcheck

## Project structure

```text
src/
  app.ts
  server.ts
  config/
  lib/
  modules/
  plugins/
  types/
prisma/
  schema.prisma
  seed.ts
  migrations/
tests/
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file and adjust the values:

```bash
Copy-Item .env.example .env
```

3. Make sure PostgreSQL is available and `DATABASE_URL` points to it.

## Local development

Generate the Prisma client if needed:

```bash
npm run prisma:generate
```

Apply the existing migration to a clean or existing database:

```bash
npm run prisma:deploy
```

Seed demo data:

```bash
npm run seed
```

Start the API in watch mode:

```bash
npm run dev
```

The server runs on `http://localhost:3000` by default, Swagger UI is served at `http://localhost:3000/docs`, and the healthcheck is `GET /health`.

## Build and production run

Compile the runtime:

```bash
npm run build
```

Start the compiled server:

```bash
npm start
```

## Migrations

Create a new local migration while developing schema changes:

```bash
npm run prisma:migrate
```

Deploy existing migrations in environments like Railway:

```bash
npm run prisma:deploy
```

Reset the database locally:

```bash
npm run prisma:reset
```

## Seed data

The seed creates:

- Provider catalog
- FREE and PRO plans
- Demo users, wallets, balances and sessions
- Provider connections
- Transfer and conversion history
- Notifications
- Subscription, invoices and payment method
- FAQs and support conversation

Demo credentials after seeding:

- `alice@milesup.app` / `Password#123` / PIN `654321`
- `bruno@milesup.app` / `Password#123` / PIN `654321`

## Tests

Run the automated test suite:

```bash
npm test
```

Notes:

- On Windows, the integration suite is skipped by default if `TEST_DATABASE_URL` is not configured.
- To run the full integration flow on Windows, create a dedicated PostgreSQL database and point `TEST_DATABASE_URL` to it.
- `npm run typecheck` validates the TypeScript source and Prisma seed.

## Railway deployment

This repository is ready for Railway using either Docker or a regular Node deployment.

### Recommended env vars

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT` provided by Railway
- `APP_BASE_URL=https://your-service.up.railway.app`
- `DATABASE_URL` from Railway PostgreSQL
- `CORS_ORIGIN` with the frontend origin or `*` during validation
- `JWT_ACCESS_SECRET` with at least 32 characters
- `RESEND_API_KEY` for real verification and password-reset emails
- `MAIL_FROM`, `MAIL_FROM_NAME` and optional `MAIL_REPLY_TO`
- `EXPOSE_DEV_CODES=false` in shared validation environments if you do not want codes in responses

### With the included Dockerfile

Railway can build directly from the repo. The container command already runs:

```bash
npx prisma migrate deploy && node dist/server.js
```

### Without Dockerfile

Use these steps in Railway:

- Build command: `npm install && npm run build`
- Start command: `npm run prisma:deploy && npm start`

Seeding is strongly recommended right after the first Railway deploy. It is required if you want the initial provider catalog, FREE and PRO plans, demo users and ready-to-test product data:

```bash
npm run seed
```

Important Railway notes:

- Set `DATABASE_URL` explicitly in the backend service variables, typically using a service reference such as `${{Postgres.DATABASE_URL}}`.
- Set `APP_BASE_URL` to the final public Railway URL of the backend service.
- The Docker image installs OpenSSL because Prisma requires it in production.
- If `RESEND_API_KEY` is configured, registration, login 2FA and password-reset emails are sent through Resend using the MilesUp branded template.
- If `EXPOSE_DEV_CODES=true`, the API still returns `devCode` for validation environments even when real email sending is enabled.

## New API overview

Base path: `/v1`

Main modules:

- `/v1/auth/*`
- `/v1/users/*`
- `/v1/dashboard`
- `/v1/wallet/*`
- `/v1/providers*`
- `/v1/provider-connections*`
- `/v1/transfers/*`
- `/v1/conversions/*`
- `/v1/billing/*`
- `/v1/notifications/*`
- `/v1/support/*`
- `/v1/media/*`

Hosted checkout pages:

- `/checkout/:publicToken`
- `/checkout/:publicToken/complete`
- `/checkout/:publicToken/cancel`

## Useful commands

```bash
npm run dev
npm run build
npm start
npm run prisma:deploy
npm run seed
npm run typecheck
npm test
```
