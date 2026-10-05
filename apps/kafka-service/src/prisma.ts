import { PrismaClient } from '@prisma/client';

/** Connects on the first query, so the service starts even while the database is down. */
export const prisma = new PrismaClient();
