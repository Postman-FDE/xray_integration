/**
 * Prisma Client Instance
 * 
 * Singleton Prisma client for database access.
 * Import this wherever you need to access the database.
 * 
 * Usage:
 *   import { prisma } from '../prisma/client.js';
 *   const result = await prisma.syncState.findMany();
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import config from '../src/config.js';

// Initialize Prisma with PostgreSQL adapter
const adapter = new PrismaPg({ connectionString: config.database.url });

export const prisma = new PrismaClient({ adapter });

/**
 * Disconnect Prisma client (for cleanup on shutdown)
 */
export async function disconnect() {
  await prisma.$disconnect();
}
