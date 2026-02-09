/**
 * Sync Job (Orchestrator)
 * 
 * Fetches runs from real Postman APIs (monitors, and future: collection runs),
 * transforms them, and syncs to Xray.
 * 
 * This is the main business logic for POST /sync/run
 */

import * as monitorService from '../services/monitorService.js';
import * as postmanService from '../services/postmanService.js';
// TODO: Enable in future iteration
// import * as collectionRunService from '../services/collectionRunService.js';
import * as syncState from '../store/syncState.js';
import * as xrayService from '../services/xrayService.js';
import { transformToXrayJson as transformMonitorResult } from '../transformers/monitorResultToXrayJson.js';
// Legacy transformer (for reference, no longer used):
// import { transformToXrayJson as transformMonitorRun } from '../transformers/monitorJsonToXrayJson.js';
// TODO: Add collection run transformer when ready
// import { transformToXrayJson as transformCollectionRun } from '../transformers/collectionRunJsonToXrayJson.js';
import config from '../config.js';

/**
 * Main sync job - coordinates fetching from multiple sources
 * 
 * Flow:
 *   1. Get workspace ID
 *   2. Fetch all collections from workspace (Postman API)
 *   3. Filter collections with test-plan-id variable (Xray-linked)
 *   4. For each collection, get monitors (Monitor API)
 *   5. Sync runs to Xray
 * 
 * @param {Object} options - Sync options
 * @param {string} options.workspaceId - Workspace ID (required unless monitorId provided)
 * @param {string} options.monitorId - Specific monitor/jobtemplate ID (optional, skips collection lookup)
 * @returns {Promise<Object>} - Sync results
 */
export async function runSyncJob(options = {}) {
  const {
    workspaceId,
    monitorId
  } = options;
  
  const isDryRun = config.sync.dryRun;

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('SYNC RUN JOB');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`Time: ${new Date().toISOString()}`);
  if (monitorId) {
    console.log(`Monitor: ${monitorId}`);
  } else {
    console.log(`Workspace: ${workspaceId}`);
  }

  if (isDryRun) {
    console.log('Mode: DRY RUN (pushes to Xray, but no DB updates)');
  } else {
    console.log('Mode: LIVE RUN (pushes to Xray and updates DB)');
  }


  // Create sync job record
  const jobId = isDryRun ? null : await syncState.createSyncJob();

  const results = {
    collections: [],
    totalSynced: 0,
    totalFailed: 0
  };

  try {
    // Step 1: Get Xray-linked collections
    let xrayCollections = [];
    
    if (monitorId) {
      // Skip collection lookup if specific monitor provided
      console.log('\n── Skipping collection lookup (specific monitor provided) ──');
      xrayCollections = [{ uid: null, name: 'Direct Monitor Sync' }];
    } else if (workspaceId) {
      console.log('\n── Step 1: Fetching Xray-linked Collections ──');
      const allCollections = await postmanService.getCollectionsWithVariables(workspaceId);
      // TODO: Also return the testplan id here. 
      xrayCollections = postmanService.filterXrayLinkedCollections(allCollections);
      console.log(`Found ${allCollections.length} collections, ${xrayCollections.length} linked to Xray`);
      
      if (xrayCollections.length === 0) {
        console.log('No collections linked to Xray. Add test-plan-id variable to collections.');
      }
      // TODO: Do we really need this? 
      for (const c of xrayCollections) {
        const testPlanId = postmanService.getTestPlanId(c);
        console.log(`• ${c.name} → ${testPlanId}`);
      }
    } else {
      throw new Error('workspaceId or monitorId is required');
    }

    // Step 2: For each collection, sync monitors
    console.log('\n── Step 2: Syncing Monitor Runs ──');
    
    for (const collection of xrayCollections) {
      // TODO: Branch out here to also sync collection runs
      try {
        const collectionResult = await syncCollectionMonitors({
          collection,
          monitorId, // If provided, only sync this specific monitor
          isDryRun,
          jobId
        });
        results.collections.push(collectionResult);
        results.totalSynced += collectionResult.runsSynced;
        results.totalFailed += collectionResult.runsFailed;
      } catch (error) {
        console.error(`Error syncing ${collection.name}: ${error.message}`);
        results.collections.push({
          collectionUid: collection.uid,
          collectionName: collection.name,
          error: error.message,
          runsSynced: 0,
          runsFailed: 0
        });
      }
    }

    // Complete job
    if (jobId) {
      let jobStatus = 'success';
      if (results.totalFailed > 0 && results.totalSynced > 0) jobStatus = 'partial';
      else if (results.totalFailed > 0 && results.totalSynced === 0) jobStatus = 'failed';
      await syncState.completeSyncJob(jobId, jobStatus);
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    if (isDryRun) {
      console.log(`✓ DRY RUN COMPLETE - ${results.totalSynced} run(s) would be synced`);
    } else {
      console.log(`✓ SYNC COMPLETE - ${results.totalSynced} synced, ${results.totalFailed} failed`);
    }
    console.log('════════════════════════════════════════════════════════════════\n');

    return {
      ...results,
      jobId,
      dryRun: isDryRun
    };

  } catch (error) {
    console.error('\n✗ SYNC ERROR:', error.message);
    if (jobId) await syncState.completeSyncJob(jobId, 'failed');
    throw error;
  }
}

/**
 * Sync all monitors (or a specific one) for a given Postman collection.
 * 
 * For each monitor found:
 *   1. Get runs since last sync
 *   2. Transform run logs to Xray JSON format
 *   3. Push to Xray
 *   4. Update sync state in DB
 * 
 * @param {Object} params
 * @param {Object} params.collection - Full collection object (with items, variables)
 * @param {string} [params.monitorId] - Specific monitor ID to sync (skips lookup if provided)
 * @param {boolean} params.isDryRun - If true, push to Xray but skip DB updates
 * @param {number} params.jobId - Sync job ID for tracking
 * @returns {Object} - { collectionUid, collectionName, testPlanId, runsSynced, runsFailed, monitors[] }
 */
async function syncCollectionMonitors({ collection, monitorId, isDryRun, jobId }) {
  const collectionUid = collection.uid;
  const collectionName = collection.name;
  const testPlanId = postmanService.getTestPlanId(collection);
  
  console.log(`\n📁 Collection: ${collectionName || collectionUid} | Test Plan: ${testPlanId || '(none)'}`);
  
  // Build folderMap from collection items (maps request IDs to folder names with test keys)
  const folderMap = postmanService.buildFolderMap(collection);
  
  let monitors = [];
  
  if (monitorId) {
    // Sync specific monitor
    console.log(`Syncing monitor: ${monitorId}`);
    monitors = [{ id: monitorId, name: 'Direct Monitor' }];
  } else if (collectionUid) {
    // Get all monitors for this collection
    monitors = await monitorService.getMonitors({ collectionId: collectionUid });
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
    const result = await syncSingleMonitor(monitor, testPlanId, folderMap, isDryRun, jobId);
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
 * Get the effective "since" timestamp - max of (baseTime, lastSyncedTimestamp)
 * This prevents syncing historical runs before the configured base time
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
  
  // Return the later of the two timestamps
  const baseDate = new Date(baseTime);
  const lastSyncDate = new Date(lastSyncedTimestamp);
  return baseDate > lastSyncDate ? baseTime : lastSyncedTimestamp;
}

/**
 * Sync a single monitor's runs
 * 
 * Uses lazy/streaming pattern for crash resilience:
 * 1. Fetch jobs list (lightweight metadata only)
 * 2. Sort oldest-first for monotonic timestamp progression
 * 3. For each job: fetch runs → fetch logs → sync → checkpoint
 * 
 * This ensures that if the service crashes mid-sync:
 * - Only runs up to the last checkpoint are marked as synced
 * - Remaining runs will be picked up on restart
 * - No wasted API calls for runs we never processed
 * 
 * @param {Object} monitor - Monitor object with id and name
 * @param {string} testPlanId - Test plan ID from collection variable
 * @param {Object} folderMap - Map of request ID to folder name (contains test keys)
 * @param {boolean} isDryRun - Skip DB updates
 * @param {number} jobId - Sync job ID
 */
async function syncSingleMonitor(monitor, testPlanId, folderMap, isDryRun, jobId) {
  const monitorId = monitor.id || monitor._id;
  const monitorName = monitor.name;

  console.log(`\n📊 Monitor: ${monitorName || monitorId}`);
  // TODO: Fix, get effective since timestamp shouldn't take any params. 
  const lastSyncedTimestamp = await syncState.getLastSyncedTimestamp(monitorId);
  const baseTime = config.sync.baseTime;
  const effectiveSince = getEffectiveSinceTimestamp(lastSyncedTimestamp);
  
  console.log(`Last synced: ${lastSyncedTimestamp || '(never)'} | Syncing since: ${effectiveSince || '(all time)'}`);

  // Step 1: Fetch jobs only (lightweight - no run details yet)
  // Jobs are returned sorted oldest-first for proper checkpoint progression
  const jobs = await monitorService.getAllMonitorJobs(monitorId, {
    sinceTimestamp: effectiveSince
  });
  console.log(`Found ${jobs.length} job(s) to sync`);

  if (jobs.length === 0) {
    return { monitorId, monitorName, testPlanId, runsSynced: 0, runs: [] };
  }

  // Step 2: Process each job lazily (oldest-first)
  const syncedRuns = [];
  let jobsProcessed = 0;
  
  for (const job of jobs) {
    jobsProcessed++;
    const jobId_internal = job.id ;
    
    // Fetch runs for this job only when we need them (lazy)
    const runs = await monitorService.getJobRuns(jobId_internal);
    
    for (const run of runs) {
      // TODO: Fix
      console.log(`Processing job ${jobsProcessed}/${jobs.length}, run ${run.id}`);
      
      // Add job context to run (including job's finishedAt for consistent timestamp tracking)
      const runWithContext = {
        ...run,
        jobId: jobId_internal, // TODO: Fix, no need jobId internal
        jobName: job.name,
        jobFinishedAt: job.finishedAt || job.createdAt  // TODO: Fix, we should use one of them. Used for sync state - must match filter timestamp
      };
      
      const runResult = await syncSingleRun({
        sourceType: 'monitor',
        sourceId: monitorId,
        sourceName: monitorName,
        testPlanId,
        run: runWithContext,
        isDryRun,
        jobId,
        getResults: () => monitorService.getRunSummary(monitorId, run.id),
        transform: (results) => transformMonitorResult(results, folderMap, { testPlanKey: testPlanId })
      });
      syncedRuns.push(runResult);
      
      // Checkpoint is updated inside syncSingleRun after each successful sync
      // This ensures crash resilience - we resume from last successful run
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

// TODO: Enable in future iteration
// /**
//  * Sync collection runs
//  */
// async function syncCollectionRuns({ workspaceId, collectionId, isDryRun, jobId }) {
//   // TODO: Get list of collections to sync
//   // For now, if collectionId is provided, sync just that one
  
//   if (!collectionId && !workspaceId) {
//     console.log('   No workspaceId or collectionId provided, skipping collection runs');
//     return [];
//   }

//   // TODO: Fetch collections list from workspace if needed
//   const collections = collectionId ? [{ id: collectionId }] : [];
  
//   if (collections.length === 0) {
//     throw new Error('Not implemented - need to fetch collections list');
//   }

//   const results = [];
//   for (const collection of collections) {
//     const result = await syncSingleCollection(collection, isDryRun, jobId);
//     results.push(result);
//   }
//   return results;
// }

// /**
//  * Sync a single collection's runs
//  */
// async function syncSingleCollection(collection, isDryRun, jobId) {
//   const { id: collectionId, name: collectionName } = collection;
//   const testPlanId = collectionRunService.getTestPlanId(collection);

//   console.log(`\n   📁 Collection: ${collectionName || collectionId}`);

//   const lastSyncedTimestamp = await syncState.getLastSyncedTimestamp(collectionId);
//   console.log(`      Last synced: ${lastSyncedTimestamp || '(never)'}`);

//   const { runs, total } = await collectionRunService.getCollectionRuns(collectionId, {
//     sinceTimestamp: lastSyncedTimestamp
//   });
//   console.log(`      Found ${runs.length} new run(s)`);

//   if (runs.length === 0) {
//     return { collectionId, collectionName, testPlanId, runsSynced: 0, runs: [] };
//   }

//   const syncedRuns = [];
//   for (const run of runs) {
//     const runResult = await syncSingleRun({
//       sourceType: 'collection',
//       sourceId: collectionId,
//       sourceName: collectionName,
//       testPlanId,
//       run,
//       isDryRun,
//       jobId,
//       getResults: () => collectionRunService.getRunResults(collectionId, run.id),
//       transform: (results) => {
//         // TODO: Use collection run transformer
//         throw new Error('Not implemented - need collection run transformer');
//       }
//     });
//     syncedRuns.push(runResult);
//   }

//   return {
//     collectionId,
//     collectionName,
//     testPlanId,
//     runsSynced: syncedRuns.filter(r => r.status !== 'error').length,
//     runs: syncedRuns
//   };
// }

/**
 * Sync a single run (generic - works for both monitors and collections)
 */
async function syncSingleRun({
  sourceType,
  sourceId,
  sourceName,
  testPlanId,
  run,
  isDryRun,
  jobId,
  getResults,
  transform
}) {
  try {
    // Fetch results
    const results = await getResults();

    // Transform to Xray format
    const xrayPayload = transform(results);

    // Push to Xray
    const xrayResult = await xrayService.importXrayJson(xrayPayload);
    console.log(`✓ Run ${run.id} → ${xrayResult.key} (${xrayPayload.tests?.length || 0} tests)`);

    // Use job's finishedAt for sync state (must match the filter timestamp in getAllMonitorJobs)
    // This prevents re-syncing the same run when job.finishedAt > run.completedAt
    const syncTimestamp = run.jobFinishedAt || run.completedAt || run.finishedAt || new Date().toISOString();

    if (isDryRun) {
      console.log('DRY RUN: Skipping DB update');
      return { runId: run.id, status: 'synced_dry_run', xrayTestExecKey: xrayResult.key };
    }

    // Update sync state
    await syncState.updateLastSynced(sourceId, run.id, syncTimestamp, {
      testPlanId,
      collectionName: sourceName
    });
    if (jobId) {
      await syncState.recordSyncRun(jobId, sourceId, run.id, 'success', xrayResult.key, null);
    }
    
    return { runId: run.id, status: 'synced', xrayTestExecKey: xrayResult.key };

  } catch (error) {
    console.error(`✗ Run ${run.id} failed: ${error.message}`);
    if (jobId) {
      await syncState.recordSyncRun(jobId, sourceId, run.id, 'error', null, error.message);
    }
    return { runId: run.id, status: 'error', error: error.message };
  }
}
