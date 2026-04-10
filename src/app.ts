import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { env } from './config/env';
import { AppError, isAppError, toAppError } from './lib/errors';
import { prisma } from './lib/prisma';
import { registerModules } from './modules';
import { authPlugin } from './plugins/auth';
import { corsPlugin } from './plugins/cors';
import { multipartPlugin } from './plugins/multipart';
import { swaggerPlugin } from './plugins/swagger';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'production'
  });

  await app.register(corsPlugin);
  await app.register(swaggerPlugin);
  await app.register(multipartPlugin);
  await app.register(authPlugin);

  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  });

  app.get('/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', timestamp: new Date().toISOString() };
    } catch (error) {
      return reply.status(503).send({
        status: 'not_ready',
        error: error instanceof Error ? error.message : 'database unreachable'
      });
    }
  });

  await registerModules(app);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request body is invalid.',
          fieldErrors: Object.fromEntries(
            error.issues.map((issue) => [issue.path.join('.'), issue.message])
          )
        }
      });
    }

    const appError = isAppError(error) ? error : toAppError(error);

    return reply.status(appError.statusCode).send({
      error: {
        code: appError.code,
        message: appError.message,
        fieldErrors: appError.fieldErrors
      }
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.'
      }
    });
  });

  return app;
}
