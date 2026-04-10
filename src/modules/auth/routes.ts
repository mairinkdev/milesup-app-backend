import crypto from 'node:crypto';

import { SessionStatus, UserRole, UserStatus, VerificationPurpose } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../../config/env';
import {
  addDays,
  hashRefreshToken,
  hashSecret,
  signAccessToken,
  verifySecret
} from '../../lib/auth';
import { ensureDefaultFreeSubscription } from '../../lib/billing';
import { sendVerificationEmail } from '../../lib/email';
import { AppError } from '../../lib/errors';
import { mapUser } from '../../lib/mappers';
import { prisma } from '../../lib/prisma';
import {
  buildVerificationResponse,
  buildVerificationDelivery,
  consumeVerificationCode,
  createVerificationCodeRecord,
  generateFlexKey,
  validateVerificationCode
} from '../../lib/verification';

const deliverySchema = z.object({
  channel: z.literal('email'),
  destinationMasked: z.string()
});

const userSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  cpf: z.string().nullable(),
  cnpj: z.string().nullable(),
  birthDate: z.string().nullable(),
  role: z.enum(['USER', 'COMPANY']),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']),
  flexKey: z.string(),
  companyName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string(),
  refreshExpiresAt: z.string(),
  user: userSchema
});

export async function authRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/register/start',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Start a new user registration',
        body: z.object({
          fullName: z.string().min(3),
          email: z.string().email(),
          phone: z.string().min(8).optional(),
          birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/).optional(),
          cpf: z.string().min(11).optional(),
          cnpj: z.string().min(14).optional(),
          role: z.nativeEnum(UserRole).default(UserRole.USER),
          companyName: z.string().min(2).optional(),
          password: z.string().min(8),
          pinCode: z.string().length(6)
        }),
        response: {
          201: z.object({
            verificationId: z.string().uuid(),
            expiresAt: z.string(),
            delivery: deliverySchema,
            devCode: z.string().optional()
          })
        }
      }
    },
    async (request, reply) => {
      const body = request.body;
      const email = body.email.trim().toLowerCase();

      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            ...(body.cpf ? [{ cpf: body.cpf }] : []),
            ...(body.cnpj ? [{ cnpj: body.cnpj }] : [])
          ]
        }
      });

      if (existing) {
        throw new AppError({
          statusCode: 409,
          code: 'ACCOUNT_ALREADY_EXISTS',
          message: 'An account with the same identity data already exists.'
        });
      }

      const passwordHash = await hashSecret(body.password);
      const transactionPinHash = await hashSecret(body.pinCode);

      const { record, code } = await createVerificationCodeRecord(prisma, {
        email,
        purpose: VerificationPurpose.REGISTER,
        payload: {
          fullName: body.fullName,
          email,
          phone: body.phone,
          birthDate: body.birthDate,
          cpf: body.cpf,
          cnpj: body.cnpj,
          role: body.role,
          companyName: body.companyName,
          passwordHash,
          transactionPinHash
        }
      });

      await sendVerificationEmail({
        to: email,
        code,
        purpose: VerificationPurpose.REGISTER,
        recipientName: body.fullName
      });

      reply.status(201);
      return buildVerificationResponse(email, record.id, record.expiresAt, code);
    }
  );

  typed.post(
    '/register/verify',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Verify a registration code and create the account',
        body: z.object({
          verificationId: z.string().uuid(),
          code: z.string().length(6)
        }),
        response: {
          201: authTokensSchema
        }
      }
    },
    async (request, reply) => {
      const verification = await validateVerificationCode(prisma, {
        verificationId: request.body.verificationId,
        code: request.body.code,
        purpose: VerificationPurpose.REGISTER
      });

      const payload = z
        .object({
          fullName: z.string(),
          email: z.string().email(),
          phone: z.string().optional(),
          birthDate: z.string().optional(),
          cpf: z.string().optional(),
          cnpj: z.string().optional(),
          role: z.nativeEnum(UserRole),
          companyName: z.string().optional(),
          passwordHash: z.string(),
          transactionPinHash: z.string()
        })
        .parse(verification.payload);

      let flexKey = generateFlexKey({
        name: payload.fullName,
        email: payload.email
      });

      while (await prisma.user.findUnique({ where: { flexKey } })) {
        flexKey = generateFlexKey({
          name: payload.fullName,
          email: payload.email
        });
      }

      const now = new Date();
      const refreshExpiresAt = addDays(now, env.REFRESH_TOKEN_TTL_DAYS);
      const accessExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const user = await prisma.user.create({
        data: {
          email: payload.email,
          name: payload.fullName,
          phone: payload.phone,
          birthDate: payload.birthDate ? new Date(payload.birthDate) : undefined,
          cpf: payload.cpf,
          cnpj: payload.cnpj,
          role: payload.role,
          companyName: payload.companyName,
          status: UserStatus.ACTIVE,
          flexKey,
          passwordHash: payload.passwordHash,
          transactionPinHash: payload.transactionPinHash,
          wallet: {
            create: {
              balances: {
                create: [
                  {
                    asset: 'FLEX_MILES',
                    amount: 0
                  }
                ]
              }
            }
          }
        }
      });

      await ensureDefaultFreeSubscription(prisma, user.id);
      await consumeVerificationCode(prisma, verification.id);

      const refreshToken = crypto.randomUUID();
      const session = await prisma.authSession.create({
        data: {
          userId: user.id,
          deviceId: 'registration',
          status: SessionStatus.ACTIVE,
          requiresTwoFactor: false,
          verifiedAt: now,
          expiresAt: accessExpiresAt,
          refreshExpiresAt,
          refreshTokenHash: hashRefreshToken(refreshToken)
        }
      });

      const accessToken = await signAccessToken(request, user, session);

      reply.status(201);
      return {
        accessToken,
        refreshToken,
        expiresAt: accessExpiresAt.toISOString(),
        refreshExpiresAt: refreshExpiresAt.toISOString(),
        user: mapUser(user, env.APP_BASE_URL)
      };
    }
  );

  typed.post(
    '/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Start a login flow and trigger email 2FA',
        body: z.object({
          email: z.string().email(),
          password: z.string().min(8),
          deviceId: z.string().min(2).optional()
        }),
        response: {
          200: z.object({
            requiresTwoFactor: z.literal(true),
            temporaryToken: z.string().uuid(),
            verificationId: z.string().uuid(),
            expiresAt: z.string(),
            delivery: deliverySchema,
            devCode: z.string().optional()
          })
        }
      }
    },
    async (request) => {
      const email = request.body.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new AppError({
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'The provided credentials are invalid.'
        });
      }

      const isValidPassword = await verifySecret(request.body.password, user.passwordHash);

      if (!isValidPassword) {
        throw new AppError({
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'The provided credentials are invalid.'
        });
      }

      const expiresAt = new Date(Date.now() + env.VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
      const session = await prisma.authSession.create({
        data: {
          userId: user.id,
          deviceId: request.body.deviceId ?? 'web',
          status: SessionStatus.PENDING_2FA,
          requiresTwoFactor: true,
          expiresAt,
          refreshExpiresAt: addDays(new Date(), env.REFRESH_TOKEN_TTL_DAYS)
        }
      });

      const { record, code } = await createVerificationCodeRecord(prisma, {
        email: user.email,
        userId: user.id,
        purpose: VerificationPurpose.LOGIN_2FA,
        payload: {
          sessionId: session.id
        }
      });

      await sendVerificationEmail({
        to: user.email,
        code,
        purpose: VerificationPurpose.LOGIN_2FA,
        recipientName: user.name
      });

      return {
        requiresTwoFactor: true as const,
        temporaryToken: session.id,
        verificationId: record.id,
        expiresAt: record.expiresAt.toISOString(),
        delivery: buildVerificationDelivery(record.email),
        devCode: env.EXPOSE_DEV_CODES ? code : undefined
      };
    }
  );

  typed.post(
    '/login/2fa',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Complete login with the 2FA code',
        body: z.object({
          temporaryToken: z.string().uuid(),
          verificationId: z.string().uuid(),
          code: z.string().length(6)
        }),
        response: {
          200: authTokensSchema
        }
      }
    },
    async (request) => {
      const session = await prisma.authSession.findUnique({
        where: {
          id: request.body.temporaryToken
        },
        include: {
          user: true
        }
      });

      if (!session || session.status !== SessionStatus.PENDING_2FA) {
        throw new AppError({
          statusCode: 404,
          code: 'LOGIN_SESSION_NOT_FOUND',
          message: 'The login session is no longer available.'
        });
      }

      const verification = await validateVerificationCode(prisma, {
        verificationId: request.body.verificationId,
        code: request.body.code,
        purpose: VerificationPurpose.LOGIN_2FA
      });

      const verificationPayload = z.object({ sessionId: z.string().uuid() }).parse(verification.payload);

      if (verificationPayload.sessionId !== session.id) {
        throw new AppError({
          statusCode: 400,
          code: 'VERIFICATION_SESSION_MISMATCH',
          message: 'The 2FA code does not belong to this login session.'
        });
      }

      const refreshToken = crypto.randomUUID();
      const refreshExpiresAt = addDays(new Date(), env.REFRESH_TOKEN_TTL_DAYS);

      await prisma.authSession.update({
        where: {
          id: session.id
        },
        data: {
          status: SessionStatus.ACTIVE,
          refreshTokenHash: hashRefreshToken(refreshToken),
          verifiedAt: new Date(),
          refreshExpiresAt
        }
      });

      await consumeVerificationCode(prisma, verification.id);

      const accessToken = await signAccessToken(request, session.user, session);

      return {
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        refreshExpiresAt: refreshExpiresAt.toISOString(),
        user: mapUser(session.user, env.APP_BASE_URL)
      };
    }
  );

  typed.post(
    '/tokens/refresh',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Refresh an access token',
        body: z.object({
          refreshToken: z.string().min(10)
        }),
        response: {
          200: authTokensSchema
        }
      }
    },
    async (request) => {
      const refreshTokenHash = hashRefreshToken(request.body.refreshToken);
      const session = await prisma.authSession.findFirst({
        where: {
          refreshTokenHash,
          status: SessionStatus.ACTIVE,
          refreshExpiresAt: {
            gt: new Date()
          }
        },
        include: {
          user: true
        }
      });

      if (!session) {
        throw new AppError({
          statusCode: 401,
          code: 'INVALID_REFRESH_TOKEN',
          message: 'The refresh token is invalid or expired.'
        });
      }

      const nextRefreshToken = crypto.randomUUID();
      const refreshExpiresAt = addDays(new Date(), env.REFRESH_TOKEN_TTL_DAYS);

      await prisma.authSession.update({
        where: {
          id: session.id
        },
        data: {
          refreshTokenHash: hashRefreshToken(nextRefreshToken),
          lastUsedAt: new Date(),
          refreshExpiresAt
        }
      });

      const accessToken = await signAccessToken(request, session.user, session);

      return {
        accessToken,
        refreshToken: nextRefreshToken,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        refreshExpiresAt: refreshExpiresAt.toISOString(),
        user: mapUser(session.user, env.APP_BASE_URL)
      };
    }
  );

  typed.post(
    '/logout',
    {
      preHandler: [app.authenticate],
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Auth'],
        summary: 'Revoke the current session',
        response: {
          200: z.object({
            ok: z.boolean()
          })
        }
      }
    },
    async (request) => {
      await prisma.authSession.update({
        where: {
          id: request.currentUser.sessionId
        },
        data: {
          status: SessionStatus.REVOKED,
          revokedAt: new Date(),
          refreshTokenHash: null
        }
      });

      return { ok: true };
    }
  );

  typed.post(
    '/password/forgot',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Start a password reset flow',
        body: z.object({
          email: z.string().email()
        }),
        response: {
          200: z.object({
            verificationId: z.string().uuid(),
            expiresAt: z.string(),
            delivery: deliverySchema,
            devCode: z.string().optional()
          })
        }
      }
    },
    async (request) => {
      const email = request.body.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        throw new AppError({
          statusCode: 404,
          code: 'ACCOUNT_NOT_FOUND',
          message: 'No account was found for the provided email.'
        });
      }

      const { record, code } = await createVerificationCodeRecord(prisma, {
        email,
        purpose: VerificationPurpose.PASSWORD_RESET,
        userId: user.id,
        payload: {
          userId: user.id
        }
      });

      await sendVerificationEmail({
        to: email,
        code,
        purpose: VerificationPurpose.PASSWORD_RESET,
        recipientName: user.name
      });

      return buildVerificationResponse(email, record.id, record.expiresAt, code);
    }
  );

  typed.post(
    '/password/reset',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Reset a password with a verification code',
        body: z.object({
          verificationId: z.string().uuid(),
          code: z.string().length(6),
          newPassword: z.string().min(8)
        }),
        response: {
          200: z.object({
            ok: z.boolean(),
            message: z.string()
          })
        }
      }
    },
    async (request) => {
      const verification = await validateVerificationCode(prisma, {
        verificationId: request.body.verificationId,
        code: request.body.code,
        purpose: VerificationPurpose.PASSWORD_RESET
      });

      const payload = z.object({ userId: z.string().uuid() }).parse(verification.payload);
      const passwordHash = await hashSecret(request.body.newPassword);

      await prisma.user.update({
        where: {
          id: payload.userId
        },
        data: {
          passwordHash
        }
      });

      await consumeVerificationCode(prisma, verification.id);

      return {
        ok: true,
        message: 'The password has been updated successfully.'
      };
    }
  );
}
