/**
 * Sync State Storage (PostgreSQL via Prisma)
 * 
 * Tracks the last synced run for each collection.
 * Also tracks sync jobs and individual run sync history.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import config from '../config.js';

// Initialize Prisma with PostgreSQL adapter
const adapter = new PrismaPg({ connectionString: config.database.url });
const prisma = new PrismaClient({ adapter });

/**
 * Get last synced timestamp for a collection
 * @param {string} collectionUid - Collection UID
 * @returns {Promise<string|null>} - Last synced run timestamp (ISO string) or null
 */
export async function getLastSyncedTimestamp(collectionUid) {
  const state = await prisma.syncState.findUnique({
    where: { collectionUid }
  });
  return state?.lastRunTimestamp?.toISOString() || null;
}

/**
 * Update last synced state for a collection
 * @param {string} collectionUid - Collection UID
 * @param {string} runId - Run ID that was synced
 * @param {string} runTimestamp - The run's completedAt timestamp
 * @param {Object} metadata - Additional metadata
 */
export async function updateLastSynced(collectionUid, runId, runTimestamp, metadata = {}) {
  await prisma.syncState.upsert({
    where: { collectionUid },
    update: {
      lastRunId: runId,
      lastRunTimestamp: runTimestamp ? new Date(runTimestamp) : null,
      testPlanKey: metadata.testPlanId,
      collectionName: metadata.collectionName
    },
    create: {
      collectionUid,
      lastRunId: runId,
      lastRunTimestamp: runTimestamp ? new Date(runTimestamp) : null,
      testPlanKey: metadata.testPlanId,
      collectionName: metadata.collectionName
    }
  });
  
  console.log(`[SyncState] Updated ${collectionUid} → lastRunTimestamp: ${runTimestamp}`);
}

/**
 * Get full sync state (all collections)
 * @returns {Promise<Object>} - State object with collections map
 */
export async function getFullState() {
  const states = await prisma.syncState.findMany();
  const lastJob = await prisma.syncJob.findFirst({
    orderBy: { startedAt: 'desc' }
  });
  
  const collections = {};
  for (const state of states) {
    collections[state.collectionUid] = {
      lastRunId: state.lastRunId,
      lastRunTimestamp: state.lastRunTimestamp?.toISOString(),
      testPlanId: state.testPlanKey,
      collectionName: state.collectionName
    };
  }
  
  return {
    lastRun: lastJob?.startedAt?.toISOString() || null,
    collections
  };
}

/**
 * Reset all sync state
 */
export async function resetState() {
  await prisma.syncRun.deleteMany();
  await prisma.syncJob.deleteMany();
  await prisma.syncState.deleteMany();
  console.log('[SyncState] Reset all state');
}

// ============================================================================
// Sync Job Tracking
// ============================================================================

/**
 * Create a new sync job record
 * @returns {Promise<number>} - Job ID
 */
export async function createSyncJob() {
  const job = await prisma.syncJob.create({
    data: {
      status: 'running',
      runsTotal: 0,
      runsSuccess: 0,
      runsFailed: 0
    }
  });
  console.log(`[SyncState] Created sync job #${job.id}`);
  return job.id;
}

/**
 * Record a synced run within a job
 * @param {number} jobId - Job ID
 * @param {string} collectionUid - Collection UID
 * @param {string} runId - Run ID
 * @param {string} status - 'success' or 'error'
 * @param {string|null} xrayExecKey - Xray test execution key (if successful)
 * @param {string|null} errorMessage - Error message (if failed)
 */
export async function recordSyncRun(jobId, collectionUid, runId, status, xrayExecKey = null, errorMessage = null) {
  await prisma.syncRun.create({
    data: {
      jobId,
      collectionUid,
      runId,
      status,
      xrayExecKey,
      errorMessage
    }
  });
  
  // Update job counters
  if (status === 'success') {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        runsTotal: { increment: 1 },
        runsSuccess: { increment: 1 }
      }
    });
  } else {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        runsTotal: { increment: 1 },
        runsFailed: { increment: 1 }
      }
    });
  }
}

/**
 * Complete a sync job
 * @param {number} jobId - Job ID
 * @param {string} status - 'success', 'partial', or 'failed'
 */
export async function completeSyncJob(jobId, status) {
  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      endedAt: new Date(),
      status
    }
  });
  console.log(`[SyncState] Completed sync job #${jobId} with status: ${status}`);
}

/**
 * Get recent sync jobs
 * @param {number} limit - Max jobs to return
 * @returns {Promise<Array>} - Recent jobs with their runs
 */
export async function getRecentJobs(limit = 10) {
  return prisma.syncJob.findMany({
    take: limit,
    orderBy: { startedAt: 'desc' },
    include: {
      runs: {
        orderBy: { syncedAt: 'desc' }
      }
    }
  });
}

/**
 * Disconnect Prisma client (for cleanup)
 */
export async function disconnect() {
  await prisma.$disconnect();
}
