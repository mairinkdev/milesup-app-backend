import fp from 'fastify-plugin';
import cors from '@fastify/cors';

import { env } from '../config/env';

export const corsPlugin = fp(async (app) => {
  await app.register(cors, {
    origin:
      env.corsOrigins.includes('*')
        ? true
        : (origin, callback) => {
            if (!origin || env.corsOrigins.includes(origin)) {
              callback(null, true);
              return;
            }

            callback(new Error('Origin not allowed by CORS'), false);
          }
  });
});
