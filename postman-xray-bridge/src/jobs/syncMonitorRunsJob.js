/**
 * Sync Monitor Runs Job
 * 
 * Worker job that syncs monitor runs to Xray.
 * Called by syncService for each collection.
 * 
 * Responsibilities:
 * - Fetch monitors for a collection
 * - Fetch runs for each monitor
 * - Transform run data to Xray format
 * - Push to Xray
 * - Update sync state
 */

import * as monitorClient from '../clients/monitorClient.js';
import * as postmanClient from '../clients/postmanClient.js';
import * as xrayClient from '../clients/xrayClient.js';
import * as syncState from '../store/syncState.js';
import { transformToXrayJson as transformMonitorResult } from '../transformers/monitorResultToXrayJson.js';
import { prisma } from '../../prisma/client.js';
import config from '../config.js';

/**
 * Sync all monitors for a given Postman collection
 * 
 * @param {Object} params
 * @param {Object} params.collection - Collection object (with items, variables)
 * @param {string} [params.monitorId] - Specific monitor ID to sync
 * @param {boolean} params.isDryRun - If true, push to Xray but skip DB updates
 * @param {number} params.jobId - Sync job ID for tracking
 * @returns {Object} - { collectionUid, collectionName, testPlanId, runsSynced, runsFailed, monitors[] }
 */
export async function syncCollectionMonitors({ collection, monitorId, isDryRun, jobId }) {
  const collectionUid = collection.uid;
  const collectionName = collection.name;
  const testPlanId = postmanClient.getTestPlanId(collection);
  
  console.log(`\n📁 Collection: ${collectionName || collectionUid} | Test Plan: ${testPlanId || '(none)'}`);
  
  // Build folderMap from collection items (maps request IDs to folder names with test keys)
  const folderMap = postmanClient.buildFolderMap(collection);
  
  let monitors = [];
  
  if (monitorId) {
    // Sync specific monitor
    console.log(`Syncing monitor: ${monitorId}`);
    monitors = [{ id: monitorId, name: 'Direct Monitor' }];
  } else if (collectionUid) {
    // Get all monitors for this collection 
    monitors = await monitorClient.getMonitors({ collectionId: collectionUid });// TODO: Should this be postmanClient?
    console.log(`Found ${monitors.length} monitor(s) for collection`);
  } else {
    console.log('No collection UID, skipping');
    return { collectionUid, collectionName, testPlanId, runsSynced: 0, runsFailed: 0, monitors: [] };
  }
  
  if (monitors.length === 0) {
    return { collectionUid, collectionName, testPlanId, runsSynced: 0, runsFailed: 0, monitors: [] };
  }

  const monitorResults = [];
  let totalSynced = 0;
  let totalFailed = 0;
  
  for (const monitor of monitors) {
    const result = await syncSingleMonitor({
      monitor,
      testPlanId,
      folderMap,
      isDryRun,
      jobId
    });
    monitorResults.push(result);
    totalSynced += result.runsSynced;
    totalFailed += result.runs.filter(r => r.status === 'error').length;
  }
  
  return {
    collectionUid,
    collectionName,
    testPlanId,
    runsSynced: totalSynced,
    runsFailed: totalFailed,
    monitors: monitorResults
  };
}

/**
 * Sync a single monitor's runs
 * 
 * Uses lazy/streaming pattern for crash resilience:
 * 1. Fetch jobs list (lightweight metadata only)
 * 2. Sort oldest-first for monotonic timestamp progression
 * 3. For each job: fetch runs → fetch logs → sync → checkpoint
 */
async function syncSingleMonitor({ monitor, testPlanId, folderMap, isDryRun, jobId }) {
  const monitorId = monitor.id; // TODO: 
  const monitorName = monitor.name;

  console.log(`\n📊 Monitor: ${monitorName || monitorId}`);
  
  const lastSyncedTimestamp = await syncState.getLastSyncedTimestamp(monitorId, 'monitor');
  const effectiveSince = getEffectiveSinceTimestamp(lastSyncedTimestamp);
  
  console.log(`Last synced: ${lastSyncedTimestamp || '(never)'} | Syncing since: ${effectiveSince || '(all time)'}`);

  // Fetch jobs (lightweight - no run details yet)
  const jobs = await monitorClient.getAllMonitorJobs(monitorId, {
    sinceTimestamp: effectiveSince
  });
  console.log(`Found ${jobs.length} job(s) to sync`);

  if (jobs.length === 0) {
    return { monitorId, monitorName, testPlanId, runsSynced: 0, runs: [] };
  }

  // Process each job lazily (oldest-first)
  const syncedRuns = [];
  let jobsProcessed = 0;
  
  for (const job of jobs) {
    jobsProcessed++;
    // Fetch runs for this job
    const runs = await monitorClient.getJobRuns(job.id);
    
    for (const run of runs) {
      console.log(`Processing job ${jobsProcessed}/${jobs.length}`);
      
      const runWithContext = {
        ...run,
        jobId: job.id,
        jobName: job.name
      };
      
      const runResult = await syncSingleRun({ // TODO: Verify, clean up. check if we can parallelize multiple runs. 
        sourceType: 'monitor',
        sourceId: monitorId,
        sourceName: monitorName,
        testPlanId,
        run: runWithContext,
        isDryRun,
        jobId,
        folderMap
      });
      syncedRuns.push(runResult);
    }
  }

  return {
    monitorId,
    monitorName,
    testPlanId,
    runsSynced: syncedRuns.filter(r => r.status !== 'error').length,
    runs: syncedRuns
  };
}

/**
 * Sync a single run
 */
async function syncSingleRun({
  sourceType,
  sourceId,
  sourceName,
  testPlanId,
  run,
  isDryRun,
  jobId,
  folderMap
}) {
  try {
    // Fetch results from monitor API
    const results = await monitorClient.getRunSummary(sourceId, run.id);

    // Transform to Xray format
    const xrayPayload = transformMonitorResult(results, folderMap, { testPlanKey: testPlanId });

    // Push to Xray
    const xrayResult = await xrayClient.importXrayJson(xrayPayload);
    console.log(`✓ Run ${run.id} → ${xrayResult.key} (${xrayPayload.tests?.length || 0} tests)`);

    const syncTimestamp =  run.finishedAt || new Date().toISOString();

    if (isDryRun) {
      console.log('DRY RUN: Skipping DB update');
      return { runId: run.id, status: 'synced_dry_run', xrayTestExecKey: xrayResult.key };
    }

    // Update sync state
    await syncState.updateLastSynced(sourceId, sourceType, run.id, syncTimestamp, {
      testPlanId,
      sourceName
    });
    
    if (jobId) {
      await syncState.recordSyncRun(jobId, sourceId, sourceType, run.id, 'success', xrayResult.key, null);
    }
    
    return { runId: run.id, status: 'synced', xrayTestExecKey: xrayResult.key };

  } catch (error) {
    console.error(`✗ Run ${run.id} failed: ${error.message}`);
    if (jobId) {
      await syncState.recordSyncRun(jobId, sourceId, sourceType, run.id, 'error', null, error.message);
    }
    return { runId: run.id, status: 'error', error: error.message };
  }
}

/**
 * Get effective "since" timestamp - max of (baseTime, lastSyncedTimestamp)
 */
function getEffectiveSinceTimestamp(lastSyncedTimestamp) {
  const baseTime = config.sync.baseTime;
  
  if (!baseTime && !lastSyncedTimestamp) {
    return null;
  }
  
  if (!baseTime) {
    return lastSyncedTimestamp;
  }
  
  if (!lastSyncedTimestamp) {
    return baseTime;
  }
  
  const baseDate = new Date(baseTime);
  const lastSyncDate = new Date(lastSyncedTimestamp);
  return baseDate > lastSyncDate ? baseTime : lastSyncedTimestamp;
}
