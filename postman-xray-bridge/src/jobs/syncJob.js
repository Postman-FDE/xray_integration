/**
 * Sync Job
 * 
 * Periodically fetches new collection runs from Postman and syncs to Xray.
 */

import * as postmanService from '../services/postmanService.js';
import * as syncState from '../store/syncState.js';
import * as xrayService from '../services/xrayService.js';
import { transformToXrayJson } from '../services/jsonToXrayTransformer.js';
import config from '../config.js';

/**
 * Main sync job - runs periodically
 * @param {string} workspaceId - Postman workspace ID to sync
 */
export async function runSyncJob(workspaceId) {
  const isDryRun = config.sync.dryRun;
  
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('                      POSTMAN → XRAY SYNC                        ');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`Workspace: ${workspaceId}`);
  console.log(`Time: ${new Date().toISOString()}`);
  if (isDryRun) {
    console.log('Mode: ⚠️  DRY RUN (Xray updated, sync-state.json NOT updated)');
  }

  try {
    // Step 1: Fetch all collections in workspace
    console.log('\n── Step 1: Fetch Collections ──────────────────────────────────');
    const allCollections = await postmanService.getCollectionsWithVariables(workspaceId);
    console.log(`Found ${allCollections.length} collections in workspace`);
    
    const linkedCollections = postmanService.filterXrayLinkedCollections(allCollections);
    console.log(`${linkedCollections.length} collection(s) linked to Xray (have test-plan-id)`);

    if (linkedCollections.length === 0) {
      console.log('No Xray-linked collections to sync. Done.');
      return { synced: 0, collections: [] };
    }

    // Step 2: Process each collection
    console.log('\n── Step 2: Sync New Runs ──────────────────────────────────────');
    const results = [];
    
    for (const collection of linkedCollections) {
      const collectionResult = await syncCollection(collection, isDryRun);
      results.push(collectionResult);
    }

    // Summary
    const totalSynced = results.reduce((sum, r) => sum + r.runsSynced, 0);
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`✓ SYNC COMPLETE - ${totalSynced} run(s) synced`);
    console.log('════════════════════════════════════════════════════════════════\n');

    return {
      synced: totalSynced,
      collections: results
    };

  } catch (error) {
    console.error('\n✗ SYNC ERROR:', error.message);
    throw error;
  }
}

/**
 * Sync a single collection's new runs
 */
async function syncCollection(collection, isDryRun = false) {
  const { uid, name } = collection;
  const testPlanId = postmanService.getTestPlanId(collection);
  
  console.log(`\n📁 Collection: ${name}`);
  console.log(`   UID: ${uid}`);
  console.log(`   Test Plan: ${testPlanId}`);
  
  // Get last synced timestamp (the completedAt of the last synced run)
  const lastSyncedTimestamp = syncState.getLastSyncedTimestamp(uid);
  console.log(`   Last synced: ${lastSyncedTimestamp || '(never)'}`);
  
  // Fetch new runs since last sync
  console.log(`   Fetching collection runs...`);
  const { runs, allRunsCount } = await postmanService.getCollectionRuns(uid, { sinceTimestamp: lastSyncedTimestamp });
  console.log(`   Found ${runs.length} new run(s) (of ${allRunsCount} total)`);
  
  if (runs.length === 0) {
    console.log(`   No new runs to sync.`);
    return {
      collectionUid: uid,
      collectionName: name,
      testPlanId,
      runsSynced: 0,
      runs: []
    };
  }
  
  // Build folder map for this collection (request ID → folder name with test_key)
  const folderMap = postmanService.buildFolderMap(collection);
  console.log(`   Mapped ${Object.keys(folderMap).length} requests to folders`);
  
  const syncedRuns = [];
  
  for (const run of runs) {
    console.log(`\n   ── Run: ${run.id} ──`);
    
    try {
      // Fetch full run results
      console.log(`      Fetching run results...`);
      const results = await postmanService.getRunResults(uid, run.id);
      const executions = results.run?.executions || results.executions || [];
      console.log(`      Got ${executions.length} executions`);
      
      // Transform JSON to Xray JSON format
      console.log(`      Transforming to Xray JSON...`);
      const xrayPayload = transformToXrayJson(results, folderMap, {
        testPlanKey: testPlanId
      });
      console.log(`      Generated ${xrayPayload.tests?.length || 0} test results`);
      
      // Push to Xray
      console.log(`      Pushing to Xray...`);
      const xrayResult = await xrayService.importXrayJson(xrayPayload);
      console.log(`      ✓ Created test execution: ${xrayResult.key}`);
      
      // Get the run's completed timestamp from results (or from run list)
      const runCompletedAt = results.meta?.completed || results.run?.meta?.completed || run.completedAt;
      
      if (isDryRun) {
        console.log(`      ⚠️  DRY RUN: Skipping state update`);
        syncedRuns.push({
          runId: run.id,
          status: 'synced_dry_run',
          executionCount: executions.length,
          xrayTestExecKey: xrayResult.key
        });
      } else {
        syncState.updateLastSynced(uid, run.id, runCompletedAt, {
          testPlanId,
          collectionName: name
        });
        console.log(`      State updated (lastRunTimestamp: ${runCompletedAt})`);
        syncedRuns.push({
          runId: run.id,
          status: 'synced',
          executionCount: executions.length,
          xrayTestExecKey: xrayResult.key
        });
      }
      
    } catch (error) {
      console.error(`      ✗ Error: ${error.message}`);
      syncedRuns.push({
        runId: run.id,
        status: 'error',
        error: error.message
      });
    }
  }
  
  return {
    collectionUid: uid,
    collectionName: name,
    testPlanId,
    runsSynced: syncedRuns.filter(r => r.status === 'synced' || r.status === 'synced_dry_run').length,
    runs: syncedRuns
  };
}
