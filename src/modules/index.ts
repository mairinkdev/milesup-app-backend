import type { FastifyInstance } from 'fastify';

import { authRoutes } from './auth/routes';
import { billingRoutes } from './billing/routes';
import { dashboardRoutes } from './dashboard/routes';
import { mediaRoutes } from './media/routes';
import { notificationRoutes } from './notifications/routes';
import { providerRoutes } from './providers/routes';
import { supportRoutes } from './support/routes';
import { transferRoutes } from './transfers/routes';
import { userRoutes } from './users/routes';
import { walletRoutes } from './wallet/routes';
import { conversionRoutes } from './conversions/routes';

export async function registerModules(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(userRoutes, { prefix: '/v1/users' });
  await app.register(dashboardRoutes, { prefix: '/v1' });
  await app.register(walletRoutes, { prefix: '/v1/wallet' });
  await app.register(providerRoutes, { prefix: '/v1' });
  await app.register(transferRoutes, { prefix: '/v1/transfers' });
  await app.register(conversionRoutes, { prefix: '/v1/conversions' });
  await app.register(billingRoutes);
  await app.register(notificationRoutes, { prefix: '/v1/notifications' });
  await app.register(supportRoutes, { prefix: '/v1/support' });
  await app.register(mediaRoutes, { prefix: '/v1/media' });
}
