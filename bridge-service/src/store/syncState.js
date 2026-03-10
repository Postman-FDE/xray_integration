/**
 * Sync State Storage (PostgreSQL via Prisma)
 * 
 * Tracks the last synced run for each source (monitor or collection).
 * Also tracks sync jobs and individual run sync history.
 * 
 * All DB operations are wrapped in try/catch so a database failure
 * doesn't crash the sync flow. State tracking is best-effort.
 */

import { prisma } from '../../prisma/client.js';

export async function getLastSyncedTimestamp(sourceId, sourceType) {
  try {
    const state = await prisma.syncState.findUnique({
      where: { sourceId_sourceType: { sourceId, sourceType } }
    });
    return state?.lastRunTimestamp?.toISOString() || null;
  } catch (error) {
    console.error(`[SyncState] Failed to get last synced timestamp for ${sourceType}:${sourceId}: ${error.message}`);
    return null;
  }
}

export async function updateLastSynced(sourceId, sourceType, runId, runTimestamp, metadata = {}) {
  try {
    await prisma.syncState.upsert({
      where: { sourceId_sourceType: { sourceId, sourceType } },
      update: {
        lastRunId: runId,
        lastRunTimestamp: runTimestamp ? new Date(runTimestamp) : null,
        testPlanKey: metadata.testPlanId,
        sourceName: metadata.sourceName
      },
      create: {
        sourceId,
        sourceType,
        lastRunId: runId,
        lastRunTimestamp: runTimestamp ? new Date(runTimestamp) : null,
        testPlanKey: metadata.testPlanId,
        sourceName: metadata.sourceName
      }
    });
    console.log(`[SyncState] Updated ${sourceType}:${sourceId} → lastRunTimestamp: ${runTimestamp}`);
  } catch (error) {
    console.error(`[SyncState] Failed to update sync state for ${sourceType}:${sourceId}: ${error.message}`);
  }
}

export async function getFullState() {
  try {
    const states = await prisma.syncState.findMany();
    const lastJob = await prisma.syncJob.findFirst({ orderBy: { startedAt: 'desc' } });

    const sources = {};
    for (const state of states) {
      const key = `${state.sourceType}:${state.sourceId}`;
      sources[key] = {
        sourceId: state.sourceId,
        sourceType: state.sourceType,
        sourceName: state.sourceName,
        lastRunId: state.lastRunId,
        lastRunTimestamp: state.lastRunTimestamp?.toISOString(),
        testPlanId: state.testPlanKey
      };
    }

    return { lastRun: lastJob?.startedAt?.toISOString() || null, sources };
  } catch (error) {
    console.error(`[SyncState] Failed to get full state: ${error.message}`);
    return { lastRun: null, sources: {} };
  }
}

export async function createSyncJob() {
  try {
    const job = await prisma.syncJob.create({
      data: { status: 'running', runsTotal: 0, runsSuccess: 0, runsFailed: 0 }
    });
    console.log(`[SyncState] Created sync job #${job.id}`);
    return job.id;
  } catch (error) {
    console.error(`[SyncState] Failed to create sync job: ${error.message}`);
    return null;
  }
}

export async function recordSyncRun(jobId, sourceId, sourceType, runId, status, xrayExecKey = null, errorMessage = null) {
  if (!jobId) return;
  try {
    await prisma.syncRun.create({
      data: { jobId, sourceId, sourceType, runId, status, xrayExecKey, errorMessage }
    });
    const updateField = status === 'success'
      ? { runsTotal: { increment: 1 }, runsSuccess: { increment: 1 } }
      : { runsTotal: { increment: 1 }, runsFailed: { increment: 1 } };
    await prisma.syncJob.update({ where: { id: jobId }, data: updateField });
  } catch (error) {
    console.error(`[SyncState] Failed to record sync run ${runId}: ${error.message}`);
  }
}

export async function completeSyncJob(jobId, status) {
  if (!jobId) return;
  try {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { endedAt: new Date(), status }
    });
    console.log(`[SyncState] Completed sync job #${jobId} with status: ${status}`);
  } catch (error) {
    console.error(`[SyncState] Failed to complete sync job #${jobId}: ${error.message}`);
  }
}

export async function getRecentJobs(limit = 10) {
  try {
    return await prisma.syncJob.findMany({
      take: limit,
      orderBy: { startedAt: 'desc' },
      include: { runs: { orderBy: { syncedAt: 'desc' } } }
    });
  } catch (error) {
    console.error(`[SyncState] Failed to get recent jobs: ${error.message}`);
    return [];
  }
}

export { disconnect } from '../../prisma/client.js';
