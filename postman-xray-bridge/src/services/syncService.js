/**
 * Sync Service
 * 
 * Orchestration layer for syncing Postman data to Xray.
 * Entry point for both HTTP controllers and cron scheduler.
 */

import * as postmanClient from '../clients/postmanClient.js';
import * as syncState from '../store/syncState.js';
import * as syncMonitorRunsJob from '../jobs/syncMonitorRunsJob.js';
import config from '../config.js';

/**
 * Sync runs for a workspace or specific monitor
 * 
 * This is the main entry point called by:
 * - Controller (POST /sync/run)
 * - Scheduler (cron trigger)
 * 
 * @param {Object} options
 * @param {string} [options.workspaceId] - Workspace ID to sync all collections
 * @param {string} [options.monitorId] - Specific monitor ID to sync
 * @returns {Promise<Object>} - Sync results
 */
export async function syncRuns(options = {}) {
  const { workspaceId, monitorId } = options;
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
    const xrayCollections = await getXrayLinkedCollections({ workspaceId, monitorId });

    // Step 2: For each collection, sync monitors (call job)
    console.log('\n── Step 2: Syncing Monitor Runs ──');
    
    for (const collection of xrayCollections) {
      try {
        const collectionResult = await syncMonitorRunsJob.syncCollectionMonitors({
          collection,
          monitorId,
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
 * Get Xray-linked collections for syncing
 * 
 * @param {Object} options
 * @param {string} [options.workspaceId] - Workspace ID
 * @param {string} [options.monitorId] - If provided, skip collection lookup
 * @returns {Promise<Array>} - Collections to sync
 */
async function getXrayLinkedCollections({ workspaceId, monitorId }) {
  if (monitorId) {
    console.log('\n── Skipping collection lookup (specific monitor provided) ──');
    return [{ uid: null, name: 'Direct Monitor Sync' }];
  }
  
  if (!workspaceId) {
    throw new Error('workspaceId or monitorId is required');
  }

  console.log('\n── Step 1: Fetching Xray-linked Collections ──');
  const allCollections = await postmanClient.getCollectionsWithVariables(workspaceId);
  const xrayCollections = postmanClient.filterXrayLinkedCollections(allCollections);
  
  console.log(`Found ${allCollections.length} collections, ${xrayCollections.length} linked to Xray`);
  
  if (xrayCollections.length === 0) {
    console.log('No collections linked to Xray. Add test-plan-id variable to collections.');
  }
  
  for (const c of xrayCollections) {
    const testPlanId = postmanClient.getTestPlanId(c);
    console.log(`• ${c.name} → ${testPlanId}`);
  }

  return xrayCollections;
}
