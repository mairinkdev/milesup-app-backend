import 'fastify';

import type { UserRole } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    currentUser: {
      userId: string;
      sessionId: string;
      role: UserRole;
    };
  }
}
