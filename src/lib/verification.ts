import type { Prisma, PrismaClient, User, VerificationPurpose, VerificationStatus } from '@prisma/client';

import { env } from '../config/env';
import { addMinutes, generateNumericCode, hashSecret, maskEmail, verifySecret } from './auth';
import { AppError } from './errors';

export async function createVerificationCodeRecord(
  prisma: PrismaClient,
  options: {
    email: string;
    purpose: VerificationPurpose;
    payload?: Record<string, unknown>;
    userId?: string;
  }
) {
  const code = generateNumericCode(6);
  const codeHash = await hashSecret(code);
  const expiresAt = addMinutes(new Date(), env.VERIFICATION_CODE_TTL_MINUTES);

  const record = await prisma.verificationCode.create({
    data: {
      userId: options.userId,
      email: options.email.toLowerCase(),
      purpose: options.purpose,
      codeHash,
      payload: options.payload as Prisma.InputJsonValue | undefined,
      expiresAt
    }
  });

  return {
    record,
    code
  };
}

export async function validateVerificationCode(
  prisma: PrismaClient,
  options: {
    verificationId: string;
    code: string;
    purpose: VerificationPurpose;
  }
) {
  const verification = await prisma.verificationCode.findUnique({
    where: {
      id: options.verificationId
    }
  });

  if (!verification || verification.purpose !== options.purpose) {
    throw new AppError({
      statusCode: 404,
      code: 'VERIFICATION_NOT_FOUND',
      message: 'The requested verification flow was not found.'
    });
  }

  if (verification.status !== 'PENDING') {
    throw new AppError({
      statusCode: 409,
      code: 'VERIFICATION_ALREADY_USED',
      message: 'This verification flow is no longer available.'
    });
  }

  if (verification.expiresAt < new Date()) {
    await prisma.verificationCode.update({
      where: { id: verification.id },
      data: { status: 'EXPIRED' }
    });

    throw new AppError({
      statusCode: 410,
      code: 'VERIFICATION_EXPIRED',
      message: 'The verification code has expired.'
    });
  }

  const isValid = await verifySecret(options.code, verification.codeHash);

  if (!isValid) {
    await prisma.verificationCode.update({
      where: { id: verification.id },
      data: {
        attempts: {
          increment: 1
        }
      }
    });

    throw new AppError({
      statusCode: 400,
      code: 'INVALID_VERIFICATION_CODE',
      message: 'The provided verification code is invalid.'
    });
  }

  return verification;
}

export async function consumeVerificationCode(
  prisma: PrismaClient,
  verificationId: string,
  status: VerificationStatus = 'USED'
) {
  return prisma.verificationCode.update({
    where: {
      id: verificationId
    },
    data: {
      status,
      verifiedAt: new Date()
    }
  });
}

export function buildVerificationDelivery(email: string) {
  return {
    channel: 'email' as const,
    destinationMasked: maskEmail(email)
  };
}

export function buildVerificationResponse(
  email: string,
  verificationId: string,
  expiresAt: Date,
  code: string
) {
  return {
    verificationId,
    expiresAt: expiresAt.toISOString(),
    delivery: buildVerificationDelivery(email),
    devCode: env.EXPOSE_DEV_CODES ? code : undefined
  };
}

export function generateFlexKey(user: Pick<User, 'name' | 'email'>) {
  const base = (user.name || user.email.split('@')[0] || 'milesup')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 18);

  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `${base || 'milesup'}.${suffix}`;
}
