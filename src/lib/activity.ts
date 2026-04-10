import type { Conversion, PrismaClient, Transfer, User } from '@prisma/client';

import { env } from '../config/env';
import { buildPagination } from './formatters';
import { parsePeriodToDateRange } from './http';
import { mapConversionActivity, mapTransferActivity } from './mappers';

type ActivityFilters = {
  userId: string;
  period?: string;
  kind?: 'ALL' | 'TRANSFERS' | 'CONVERSIONS';
  direction?: 'ALL' | 'INCOMING' | 'OUTGOING';
  page: number;
  pageSize: number;
};

type ActivityUser = Pick<User, 'id' | 'name' | 'email' | 'flexKey' | 'profilePhotoAssetId'>;

type TransferWithParticipants = Transfer & {
  fromUser: ActivityUser;
  toUser: ActivityUser;
};

export async function loadWalletActivities(prisma: PrismaClient, filters: ActivityFilters) {
  const range = parsePeriodToDateRange(filters.period);

  const transferWhere = {
    createdAt: {
      gte: range.from,
      lte: range.to
    },
    OR:
      filters.direction === 'INCOMING'
        ? [{ toUserId: filters.userId }]
        : filters.direction === 'OUTGOING'
          ? [{ fromUserId: filters.userId }]
          : [{ fromUserId: filters.userId }, { toUserId: filters.userId }]
  };

  const conversionWhere = {
    userId: filters.userId,
    createdAt: {
      gte: range.from,
      lte: range.to
    }
  };

  const [transfers, conversions] = await Promise.all([
    filters.kind === 'CONVERSIONS'
      ? Promise.resolve([] as TransferWithParticipants[])
      : prisma.transfer.findMany({
          where: transferWhere,
          include: {
            fromUser: {
              select: {
                id: true,
                name: true,
                email: true,
                flexKey: true,
                profilePhotoAssetId: true
              }
            },
            toUser: {
              select: {
                id: true,
                name: true,
                email: true,
                flexKey: true,
                profilePhotoAssetId: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }),
    filters.kind === 'TRANSFERS'
      ? Promise.resolve([] as Conversion[])
      : prisma.conversion.findMany({
          where: conversionWhere,
          orderBy: {
            createdAt: 'desc'
          }
        })
  ]);

  const activities = [
    ...transfers.map((transfer) => mapTransferActivity(transfer, filters.userId, env.APP_BASE_URL)),
    ...conversions.map(mapConversionActivity)
  ].sort((left, right) => {
    return new Date(right.createdAt ?? '').getTime() - new Date(left.createdAt ?? '').getTime();
  });

  const offset = (filters.page - 1) * filters.pageSize;
  const paginatedItems = activities.slice(offset, offset + filters.pageSize);

  return {
    items: paginatedItems,
    summary: {
      transfersCount: transfers.length,
      totalSentMiles: transfers
        .filter((item) => item.fromUserId === filters.userId)
        .reduce((sum, item) => sum + item.amountMiles, 0),
      totalReceivedMiles: transfers
        .filter((item) => item.toUserId === filters.userId)
        .reduce((sum, item) => sum + item.amountMiles, 0),
      conversionsCount: conversions.length,
      totalConvertedMiles: conversions.reduce((sum, item) => sum + item.amountOutMiles, 0),
      period: {
        from: range.from.toISOString(),
        to: range.to.toISOString()
      }
    },
    ...buildPagination(filters.page, filters.pageSize, activities.length)
  };
}
