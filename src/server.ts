import { buildApp } from './app';
import { env } from './config/env';
import { ensureBillingPlans } from './lib/billingPlans';
import { ensureProviderCatalog } from './lib/providerCatalog';
import { prisma } from './lib/prisma';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  // Warm up the Prisma connection in the background so the first real
  // request doesn't pay the connect cost. We don't await it on the
  // critical path because the /health endpoint must respond fast for
  // Railway's healthcheck.
  prisma
    .$connect()
    .then(async () => {
      app.log.info('prisma: connection established');
      await ensureProviderCatalog();
      app.log.info('provider catalog: ready');
      await ensureBillingPlans();
      app.log.info('billing plans: ready');
    })
    .catch((error) => app.log.error({ err: error }, 'prisma: failed to connect'));
}

void start();

async function shutdown() {
  await prisma.$disconnect();
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});
