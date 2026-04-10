import type { NotificationType, PrismaClient, User } from '@prisma/client';

export async function createNotification(
  prisma: PrismaClient,
  options: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    actionUrl?: string;
  }
) {
  return prisma.notification.create({
    data: {
      userId: options.userId,
      type: options.type,
      title: options.title,
      body: options.body,
      actionUrl: options.actionUrl
    }
  });
}

export function buildRecipientDisplay(user: Pick<User, 'name' | 'companyName' | 'flexKey'>) {
  return {
    displayName: user.companyName?.trim() || user.name,
    handle: user.flexKey
  };
}
