import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';
import type { AuthSession, User, UserRole } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../config/env';
import { AppError } from './errors';

export function hashRefreshToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function hashSecret(secret: string) {
  return bcrypt.hash(secret, env.PASSWORD_SALT_ROUNDS);
}

export async function verifySecret(secret: string, hash: string) {
  return bcrypt.compare(secret, hash);
}

export function generateNumericCode(length = 6) {
  const max = 10 ** length;
  const value = crypto.randomInt(0, max);
  return String(value).padStart(length, '0');
}

export function generateOpaqueToken(size = 32) {
  return crypto.randomBytes(size).toString('hex');
}

export function maskEmail(email: string) {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) {
    return email;
  }

  const visible = localPart.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(localPart.length - 2, 1))}@${domain}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

export function createAccessTokenPayload(user: User, session: AuthSession) {
  return {
    sub: user.id,
    role: user.role,
    sessionId: session.id
  };
}

export async function signAccessToken(
  request: FastifyRequest,
  user: User,
  session: AuthSession
) {
  return request.server.jwt.sign(createAccessTokenPayload(user, session), {
    expiresIn: env.JWT_ACCESS_TTL
  });
}

export async function requireAuthenticatedUser(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify<{ sub: string; sessionId: string; role: UserRole }>();
    const token = request.user as { sub: string; sessionId: string; role: UserRole };
    request.currentUser = {
      userId: token.sub,
      sessionId: token.sessionId,
      role: token.role
    };
  } catch {
    throw new AppError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'You need to be authenticated to access this resource.'
    });
  }
}
