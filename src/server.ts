import { buildApp } from './app';
import { env } from './config/env';
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
