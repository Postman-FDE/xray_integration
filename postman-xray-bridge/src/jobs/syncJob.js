/**
 * Sync Job
 * 
 * Periodically fetches new collection runs from Postman and syncs to Xray.
 * Runs every hour (configurable).
 */

import * as postmanService from '../services/postmanService.js';
import * as syncState from '../store/syncState.js';
// import * as xrayService from '../services/xrayService.js';

/**
 * Main sync job - runs periodically
 * @param {string} workspaceId - Postman workspace ID to sync
 */
export async function runSyncJob(workspaceId) {
  console.log('\n========================================');
  console.log('[SyncJob] Starting sync job...');
  console.log(`[SyncJob] Workspace: ${workspaceId}`);
  console.log(`[SyncJob] Time: ${new Date().toISOString()}`);
  console.log('========================================\n');

  try {
    // Step 1: Fetch all collections in workspace (with variables)
    console.log('[SyncJob] Step 1: Fetching collections with variables...');
    const allCollections = await postmanService.getCollectionsWithVariables(workspaceId);
    console.log(`[SyncJob] Found ${allCollections.length} collections`);

    // Step 2: Filter to only Xray-linked collections
    console.log('[SyncJob] Step 2: Filtering Xray-linked collections...');
    const linkedCollections = postmanService.filterXrayLinkedCollections(allCollections);
    console.log(`[SyncJob] ${linkedCollections.length} collections linked to Xray`);

    if (linkedCollections.length === 0) {
      console.log('[SyncJob] No collections to sync. Done.');
      return { synced: 0, collections: [] };
    }

    // Step 3: For each collection, fetch and sync new runs
    const results = [];
    
    for (const collection of linkedCollections) {
      console.log(`\n[SyncJob] Processing: ${collection.name}`);
      
      const collectionResult = await syncCollection(collection);
      results.push(collectionResult);
    }

    // Summary
    const totalSynced = results.reduce((sum, r) => sum + r.runsSynced, 0);
    console.log('\n========================================');
    console.log(`[SyncJob] Sync complete!`);
    console.log(`[SyncJob] Total runs synced: ${totalSynced}`);
    console.log('========================================\n');

    return {
      synced: totalSynced,
      collections: results
    };

  } catch (error) {
    console.error('[SyncJob] Error:', error.message);
    throw error;
  }
}

/**
 * Sync a single collection's new runs
 * @param {Object} collection - Collection object
 * @returns {Object} - Sync result
 */
async function syncCollection(collection) {
  const { uid, name } = collection;
  const testPlanId = postmanService.getTestPlanId(collection);
  
  console.log(`[SyncJob]   Collection UID: ${uid}`);
  console.log(`[SyncJob]   Test Plan: ${testPlanId}`);
  
  // Get last synced run ID
  const lastRunId = syncState.getLastSyncedRunId(uid);
  console.log(`[SyncJob]   Last synced run: ${lastRunId || '(none)'}`);
  
  // Fetch new runs since last sync
  const { runs } = await postmanService.getCollectionRuns(uid, { since: lastRunId });
  console.log(`[SyncJob]   New runs found: ${runs.length}`);
  
  if (runs.length === 0) {
    return {
      collectionUid: uid,
      collectionName: name,
      testPlanId,
      runsSynced: 0,
      runs: []
    };
  }
  
  // Process each run
  const syncedRuns = [];
  
  for (const run of runs) {
    console.log(`[SyncJob]   Syncing run: ${run.id}`);
    
    try {
      // Fetch full run results
      const results = await postmanService.getRunResults(uid, run.id);
      
      // TODO: Transform results to JUnit XML
      // const junitXml = transformToJUnitXml(results, testPlanId);
      
      // TODO: Push to Xray
      // const xrayResult = await xrayService.importJUnitResults(junitXml, {
      //   projectKey: testPlanId.split('-')[0], // Extract project key from SJP-1
      //   testPlanKey: testPlanId
      // });
      
      // Get executions from the run results (structure: results.run.executions)
      const executions = results.run?.executions || [];
      
      // For now, just log what we would do
      console.log(`[SyncJob]     → Would transform ${executions.length} executions`);
      console.log(`[SyncJob]     → Would push to Xray test plan: ${testPlanId}`);
      
      // Update state after successful sync
      syncState.updateLastSyncedRunId(uid, run.id, {
        testPlanId,
        collectionName: name
      });
      
      syncedRuns.push({
        runId: run.id,
        status: 'synced',
        executionCount: executions.length
      });
      
    } catch (error) {
      console.error(`[SyncJob]     ✗ Error syncing run ${run.id}:`, error.message);
      syncedRuns.push({
        runId: run.id,
        status: 'error',
        error: error.message
      });
      // Don't update state on error - will retry next time
    }
  }
  
  return {
    collectionUid: uid,
    collectionName: name,
    testPlanId,
    runsSynced: syncedRuns.filter(r => r.status === 'synced').length,
    runs: syncedRuns
  };
}

/**
 * Transform run results to JUnit XML
 * TODO: Implement when we figure out the transformation logic
 */
function transformToJUnitXml(results, testPlanId) {
  // Placeholder - will implement later
  throw new Error('Not implemented yet');
}

