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

import { getMonitors, getAllMonitorJobs, getJobRuns, getRunLog } from '../clients/monitorClient.js';
import { importXrayJson } from '../clients/xrayClient.js';
import { getLastSyncedTimestamp, updateLastSynced, recordSyncRun } from '../store/syncState.js';
import { transformToXrayJson as transformMonitorLog } from '../transformers/monitorJsonToXrayJson.js';
import { config } from '../config.js';

/**
 * Sync all monitors for a given Postman collection
 * 
 * @param {Object} params
 * @param {Object} params.collection - Collection object (with items, variables)
 * @param {number} params.jobId - Sync job ID for tracking
 * @returns {Object} - { collectionUid, collectionName, testPlanId, runsSynced, runsFailed, monitors[] }
 */
export async function syncCollectionMonitors({ collection, jobId }) {
  const collectionUid = collection.uid;
  const collectionName = collection.name;
  const testPlanId = collection.variable?.find(v => v.key === 'test-plan-id')?.value || null;
  
  console.log(`\n📁 Collection: ${collectionName || collectionUid} | Test Plan: ${testPlanId || '(none)'}`);
  
  // Build folderMap from collection items (maps request IDs to folder names with test keys)
  const folderMap = buildFolderMap(collection);
  
  const uniqueFolders = [...new Set(Object.values(folderMap).filter(Boolean))];
  console.log(`Folder map: ${Object.keys(folderMap).length} request(s) mapped to ${uniqueFolders.length} test key(s)`);
  for (const folder of uniqueFolders) {
    const count = Object.values(folderMap).filter(v => v === folder).length;
    console.log(`  ${extractTestKeyFromName(folder) || '(none)'} → ${folder} (${count} request(s))`);
  }
  const unmappedCount = Object.values(folderMap).filter(v => v === null).length;
  if (unmappedCount > 0) {
    console.log(`  ⚠ ${unmappedCount} request(s) not mapped to any test key`);
  }

  const monitors = await getMonitors({ collectionId: collectionUid });
  console.log(`Found ${monitors.length} monitor(s) for collection`);
  
  if (monitors.length === 0) {
    return { collectionUid, collectionName, testPlanId, runsSynced: 0, runsFailed: 0, monitors: [] };
  }

  const monitorResults = await Promise.all(
    monitors.map(monitor => syncSingleMonitor({ monitor, testPlanId, collectionName, folderMap, jobId }))
  );

  let totalSynced = 0;
  let totalFailed = 0;
  for (const result of monitorResults) {
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
async function syncSingleMonitor({ monitor, testPlanId, collectionName, folderMap, jobId }) {
  const monitorId = monitor.id;
  const monitorName = monitor.name;

  console.log(`\n📊 Monitor: ${monitorName || monitorId}`);
  
  const lastSyncedTimestamp = await getLastSyncedTimestamp(monitorId, 'monitor');
  const effectiveSince = getEffectiveSinceTimestamp(lastSyncedTimestamp);
  
  console.log(`Last synced: ${lastSyncedTimestamp || '(never)'} | Syncing since: ${effectiveSince || '(all time)'}`);

  // Fetch jobs (lightweight - no run details yet)
  const jobs = await getAllMonitorJobs(monitorId, {
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
    const runs = await getJobRuns(monitorId, job.id);
    
    for (const run of runs) {
      console.log(`Processing job ${jobsProcessed}/${jobs.length}`);
      
      const runWithContext = {
        ...run,
        jobId: job.id,
        jobName: job.name,
        jobFinishedAt: job.finishedAt
      };
      
      const runResult = await syncSingleRun({
        sourceType: 'monitor',
        sourceId: monitorId,
        sourceName: monitorName,
        testPlanId,
        collectionName,
        run: runWithContext,
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
  collectionName,
  run,
  jobId,
  folderMap
}) {
  try {
    const runLog = await getRunLog(sourceId, run.id);

    const xrayPayload = transformMonitorLog(runLog, folderMap, { testPlanKey: testPlanId, collectionName });

    if (!xrayPayload.tests || xrayPayload.tests.length === 0) {
      console.log(`⚠ Run ${run.id} has 0 mapped tests, skipping Xray push. Check folder naming (expected "PF-XX | ..." pattern).`);
      return { runId: run.id, status: 'skipped', reason: 'no tests mapped' };
    }

    console.log(`  Xray payload: ${xrayPayload.tests.length} test(s) for test plan ${testPlanId}`);
    for (const test of xrayPayload.tests) {
      console.log(`    ${test.testKey} → ${test.status} (${test.comment?.split('\n')[0] || 'no comment'})`);
    }

    const xrayResult = await importXrayJson(xrayPayload);
    console.log(`✓ Run ${run.id} → ${xrayResult.key} (${xrayPayload.tests.length} tests)`);

    const syncTimestamp = run.jobFinishedAt || run.finishedAt || new Date().toISOString();

    // Update sync state
    await updateLastSynced(sourceId, sourceType, run.id, syncTimestamp, {
      testPlanId,
      sourceName
    });
    
    await recordSyncRun(jobId, sourceId, sourceType, run.id, 'success', xrayResult.key, null);
    
    return { runId: run.id, status: 'synced', xrayTestExecKey: xrayResult.key };

  } catch (error) {
    console.error(`✗ Run ${run.id} failed: ${error.message}`);
    await recordSyncRun(jobId, sourceId, sourceType, run.id, 'error', null, error.message);
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

/**
 * Build a map of request ID → folder name.
 * The folder name contains the test key (e.g., "PF-52 | Create Loan").
 */
function buildFolderMap(collection) {
  const folderMap = {};

  function walk(items, testKeyFolder) {
    if (!items || !Array.isArray(items)) return;
    for (const item of items) {
      const hasTestKey = /^[A-Z]+-\d+\s*\|/.test(item.name);
      const currentFolder = hasTestKey ? item.name : testKeyFolder;

      if (item.item && Array.isArray(item.item)) {
        walk(item.item, currentFolder);
      } else if (item.id) {
        folderMap[item.id] = hasTestKey ? item.name : (currentFolder || null);
      }
    }
  }

  walk(collection.item, null);
  return folderMap;
}

function extractTestKeyFromName(name) {
  if (!name) return null;
  const match = name.match(/^([A-Z]+-\d+)\s*\|/);
  return match ? match[1] : null;
}
