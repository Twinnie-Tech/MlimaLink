import { prisma } from '../prisma';
import type { UserAction } from '../utils/preprocess-data';

const OBJECT_ID = /^[a-f\d]{24}$/i;

type StoredActivity = {
  userId: string;
  actions: {
    action: string;
    productId: string;
    shopId: string | null;
    at: Date;
  }[];
};

const toUserActions = ({ userId, actions }: StoredActivity): UserAction[] =>
  actions.map((entry) => ({ userId, ...entry }));

/** One shopper's latest actions, oldest first; empty when they haven't done anything yet. */
export async function getUserActivity(userId: string): Promise<UserAction[]> {
  if (!OBJECT_ID.test(userId)) return [];
  const analytics = await prisma.user_analytics.findUnique({
    where: { userId },
    select: { userId: true, actions: true },
  });
  return analytics ? toUserActions(analytics) : [];
}

/** Every shopper's latest actions, so the model can learn from what similar shoppers did. */
export async function getAllUserActivity(): Promise<UserAction[]> {
  const rows = await prisma.user_analytics.findMany({
    select: { userId: true, actions: true },
  });
  return rows.flatMap(toUserActions);
}
