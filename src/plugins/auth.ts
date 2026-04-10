import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';

import { env } from '../config/env';
import { requireAuthenticatedUser } from '../lib/auth';

export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET
  });

  app.decorate('authenticate', requireAuthenticatedUser);
});
