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
    console.log('Mode: ⚠️  DRY RUN (pushes to Xray, but no DB updates)');
  }

  // Create sync job record (skip in dry run)
  const jobId = isDryRun ? null : await syncState.createSyncJob();

  try {
    // Step 1: Fetch all collections in workspace
    console.log('\n── Step 1: Fetch Collections ──────────────────────────────────');
    const allCollections = await postmanService.getCollectionsWithVariables(workspaceId);
    console.log(`Found ${allCollections.length} collections in workspace`);
    
    const linkedCollections = postmanService.filterXrayLinkedCollections(allCollections);
    console.log(`${linkedCollections.length} collection(s) linked to Xray (have test-plan-id)`);

    if (linkedCollections.length === 0) {
      console.log('No Xray-linked collections to sync. Done.');
      if (jobId) await syncState.completeSyncJob(jobId, 'success');
      return { synced: 0, collections: [], jobId };
    }

    // Step 2: Process each collection
    console.log('\n── Step 2: Sync New Runs ──────────────────────────────────────');
    const results = [];
    
    for (const collection of linkedCollections) {
      const collectionResult = await syncCollection(collection, isDryRun, jobId);
      results.push(collectionResult);
    }

    // Summary
    const totalSynced = results.reduce((sum, r) => sum + r.runsSynced, 0);
    const totalFailed = results.reduce((sum, r) => r.runs.filter(run => run.status === 'error').length, 0);
    
    // Determine job status and complete (skip in dry run)
    if (jobId) {
      let jobStatus = 'success';
      if (totalFailed > 0 && totalSynced > 0) {
        jobStatus = 'partial';
      } else if (totalFailed > 0 && totalSynced === 0) {
        jobStatus = 'failed';
      }
      await syncState.completeSyncJob(jobId, jobStatus);
    }
    
    console.log('\n════════════════════════════════════════════════════════════════');
    if (isDryRun) {
      console.log(`✓ DRY RUN COMPLETE - ${totalSynced} run(s) would be synced`);
    } else {
      console.log(`✓ SYNC COMPLETE - ${totalSynced} run(s) synced, ${totalFailed} failed`);
    }
    console.log('════════════════════════════════════════════════════════════════\n');

    return {
      synced: totalSynced,
      failed: totalFailed,
      collections: results,
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
 * Sync a single collection's new runs
 */
async function syncCollection(collection, isDryRun = false, jobId = null) {
  const { uid, name } = collection;
  const testPlanId = postmanService.getTestPlanId(collection);
  
  console.log(`\n📁 Collection: ${name}`);
  console.log(`   UID: ${uid}`);
  console.log(`   Test Plan: ${testPlanId}`);
  
  // Get last synced timestamp (the completedAt of the last synced run)
  const lastSyncedTimestamp = await syncState.getLastSyncedTimestamp(uid);
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
        console.log(`      ⚠️  DRY RUN: Skipping DB update`);
        syncedRuns.push({
          runId: run.id,
          status: 'synced_dry_run',
          executionCount: executions.length,
          xrayTestExecKey: xrayResult.key
        });
      } else {
        // Update sync state and record run
        await syncState.updateLastSynced(uid, run.id, runCompletedAt, {
          testPlanId,
          collectionName: name
        });
        if (jobId) {
          await syncState.recordSyncRun(jobId, uid, run.id, 'success', xrayResult.key, null);
        }
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
      // Record failed run
      if (jobId) {
        await syncState.recordSyncRun(jobId, uid, run.id, 'error', null, error.message);
      }
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
