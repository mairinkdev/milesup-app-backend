import path from 'node:path';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const projectRoot = path.resolve(__dirname, '..');
const databaseDir = path.join(process.env.TEMP ?? 'C:\\Temp', 'milesup-embedded-postgres');
const port = 54331;
const databaseName = 'milesup_test';
const managedDatabaseUrl = `postgresql://postgres:password@127.0.0.1:${port}/${databaseName}?schema=public`;
const externalDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseUrl = externalDatabaseUrl ?? managedDatabaseUrl;
const canUseEmbeddedPostgres = process.platform !== 'win32';
const shouldRunIntegration = Boolean(externalDatabaseUrl) || canUseEmbeddedPostgres;

type EmbeddedPostgresInstance = {
  initialise: () => Promise<void>;
  start: () => Promise<void>;
  createDatabase: (name: string) => Promise<void>;
  stop: () => Promise<void>;
};

let pg: EmbeddedPostgresInstance | undefined;
let app: Awaited<ReturnType<typeof import('../src/app').buildApp>>;
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('MilesUp greenfield API', () => {
  beforeAll(async () => {
    if (!externalDatabaseUrl) {
      fs.rmSync(databaseDir, {
        recursive: true,
        force: true
      });

      const { default: EmbeddedPostgres } = await import('embedded-postgres');

      pg = new EmbeddedPostgres({
        databaseDir,
        user: 'postgres',
        password: 'password',
        port,
        persistent: false,
        initdbFlags: ['--encoding=UTF8', '--locale=C']
      }) as EmbeddedPostgresInstance;

      await pg.initialise();
      await pg.start();
      await pg.createDatabase(databaseName);
    }

    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = databaseUrl;
    process.env.APP_BASE_URL = 'http://127.0.0.1:3001';
    process.env.JWT_ACCESS_SECRET = '12345678901234567890123456789012';
    process.env.CORS_ORIGIN = '*';
    process.env.EXPOSE_DEV_CODES = 'true';

    execSync('npx prisma migrate reset --force --skip-generate --skip-seed', {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl
      },
      stdio: 'inherit'
    });

    execSync('npx tsx prisma/seed.ts', {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl
      },
      stdio: 'inherit'
    });

    const appModule = await import('../src/app');
    app = await appModule.buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (pg) {
      await pg.stop();
    }
  });

  it('boots healthcheck and supports a full auth + product flow', async () => {
    const health = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(health.statusCode).toBe(200);

    const registerStart = await app.inject({
      method: 'POST',
      url: '/v1/auth/register/start',
      payload: {
        fullName: 'Carla Teste',
        email: 'carla@teste.app',
        password: 'Password#123',
        pinCode: '654321',
        phone: '+5511977773333',
        birthDate: '1995-04-21T00:00:00.000Z'
      }
    });

    expect(registerStart.statusCode).toBe(201);
    const registerStartBody = registerStart.json();
    expect(registerStartBody.devCode).toBeDefined();

    const registerVerify = await app.inject({
      method: 'POST',
      url: '/v1/auth/register/verify',
      payload: {
        verificationId: registerStartBody.verificationId,
        code: registerStartBody.devCode
      }
    });

    expect(registerVerify.statusCode).toBe(201);
    const registerVerifyBody = registerVerify.json();
    expect(registerVerifyBody.accessToken).toBeTruthy();

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'alice@milesup.app',
        password: 'Password#123',
        deviceId: 'test-browser'
      }
    });

    expect(login.statusCode).toBe(200);
    const loginBody = login.json();
    expect(loginBody.requiresTwoFactor).toBe(true);
    expect(loginBody.devCode).toBeTruthy();

    const verify2fa = await app.inject({
      method: 'POST',
      url: '/v1/auth/login/2fa',
      payload: {
        temporaryToken: loginBody.temporaryToken,
        verificationId: loginBody.verificationId,
        code: loginBody.devCode
      }
    });

    expect(verify2fa.statusCode).toBe(200);
    const auth = verify2fa.json();
    const headers = {
      authorization: `Bearer ${auth.accessToken}`
    };

    const me = await app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers
    });

    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('alice@milesup.app');

    const dashboard = await app.inject({
      method: 'GET',
      url: '/v1/dashboard?period=30d',
      headers
    });

    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().recentActivities.length).toBeGreaterThan(0);

    const connections = await app.inject({
      method: 'GET',
      url: '/v1/provider-connections',
      headers
    });

    expect(connections.statusCode).toBe(200);
    const providerConnectionId = connections.json().items[0].id;

    const conversionIntent = await app.inject({
      method: 'POST',
      url: '/v1/conversions/intents',
      headers,
      payload: {
        providerConnectionId,
        amountMiles: 1000
      }
    });

    expect(conversionIntent.statusCode).toBe(201);
    const conversionIntentBody = conversionIntent.json();

    const confirmConversion = await app.inject({
      method: 'POST',
      url: `/v1/conversions/intents/${conversionIntentBody.id}/confirm`,
      headers,
      payload: {
        pinCode: '654321'
      }
    });

    expect(confirmConversion.statusCode).toBe(200);

    const resolveRecipient = await app.inject({
      method: 'POST',
      url: '/v1/transfers/recipient-resolution',
      headers,
      payload: {
        query: 'bruno@milesup.app'
      }
    });

    expect(resolveRecipient.statusCode).toBe(200);

    const transferIntent = await app.inject({
      method: 'POST',
      url: '/v1/transfers/intents',
      headers,
      payload: {
        recipientHandleOrEmail: 'bruno@milesup.app',
        amountMiles: 1000,
        note: 'Integration test transfer'
      }
    });

    expect(transferIntent.statusCode).toBe(201);
    const transferIntentBody = transferIntent.json();

    const confirmTransfer = await app.inject({
      method: 'POST',
      url: `/v1/transfers/intents/${transferIntentBody.id}/confirm`,
      headers,
      payload: {
        pinCode: '654321'
      }
    });

    expect(confirmTransfer.statusCode).toBe(200);

    const walletActivities = await app.inject({
      method: 'GET',
      url: '/v1/wallet/activities?period=30d&page=1&pageSize=20',
      headers
    });

    expect(walletActivities.statusCode).toBe(200);
    expect(walletActivities.json().items.length).toBeGreaterThan(0);

    const brunoLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'bruno@milesup.app',
        password: 'Password#123',
        deviceId: 'test-browser'
      }
    });

    const bruno2fa = await app.inject({
      method: 'POST',
      url: '/v1/auth/login/2fa',
      payload: {
        temporaryToken: brunoLogin.json().temporaryToken,
        verificationId: brunoLogin.json().verificationId,
        code: brunoLogin.json().devCode
      }
    });

    const brunoHeaders = {
      authorization: `Bearer ${bruno2fa.json().accessToken}`
    };

    const checkout = await app.inject({
      method: 'POST',
      url: '/v1/billing/checkout-sessions',
      headers: brunoHeaders,
      payload: {
        planCode: 'PRO',
        interval: 'MONTH',
        successRedirectUrl: 'http://127.0.0.1:8081/success',
        cancelRedirectUrl: 'http://127.0.0.1:8081/cancel'
      }
    });

    expect(checkout.statusCode).toBe(201);
    const checkoutUrl = new URL(checkout.json().url);

    const openCheckout = await app.inject({
      method: 'GET',
      url: checkoutUrl.pathname
    });

    expect(openCheckout.statusCode).toBe(200);

    const completeCheckout = await app.inject({
      method: 'GET',
      url: `${checkoutUrl.pathname}/complete`
    });

    expect(completeCheckout.statusCode).toBe(302);

    const subscription = await app.inject({
      method: 'GET',
      url: '/v1/billing/subscription',
      headers: brunoHeaders
    });

    expect(subscription.statusCode).toBe(200);
    expect(subscription.json().status).toBe('ACTIVE');

    const notifications = await app.inject({
      method: 'GET',
      url: '/v1/notifications?page=1&pageSize=10',
      headers
    });

    expect(notifications.statusCode).toBe(200);
    expect(notifications.json().items.length).toBeGreaterThan(0);

    const faqs = await app.inject({
      method: 'GET',
      url: '/v1/support/faqs',
      headers
    });

    expect(faqs.statusCode).toBe(200);

    const supportMessage = await app.inject({
      method: 'POST',
      url: '/v1/support/conversation/messages',
      headers,
      payload: {
        message: 'Can you confirm my subscription and recent transfer history?'
      }
    });

    expect(supportMessage.statusCode).toBe(201);
    expect(supportMessage.json().messages.length).toBeGreaterThan(1);
  }, 180_000);
});
