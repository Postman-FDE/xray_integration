/**
 * Sync Service
 * 
 * Orchestration layer for syncing Postman data to Xray.
 * Entry point for both HTTP controllers and cron scheduler.
 */

import * as postmanClient from '../clients/postmanClient.js';
import * as syncState from '../store/syncState.js';
import * as syncMonitorRunsJob from '../jobs/syncMonitorRuns.job.js';

/**
 * Sync runs for a workspace
 * 
 * This is the main entry point called by:
 * - Controller (POST /sync/run)
 * - Scheduler (cron trigger)
 * 
 * @param {Object} options
 * @param {string} options.workspaceId - Workspace ID to sync all collections
 * @returns {Promise<Object>} - Sync results
 */
export async function syncRuns(options = {}) {
  const { workspaceId } = options;

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('SYNC RUN JOB');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Workspace: ${workspaceId}`);

  const jobId = await syncState.createSyncJob();
  if (!jobId) {
    throw new Error('Database is unavailable. Aborting sync to prevent duplicate processing.');
  }

  const results = {
    collections: [],
    totalSynced: 0,
    totalFailed: 0
  };

  try {
    // Step 1: Get Xray-linked collections. fetch all collections from workspace, filter to collections with test-plan-id variable
    const xrayCollections = await getXrayLinkedCollections(workspaceId);

    // Step 2: For each collection, sync monitors (call job)
    console.log('\n── Step 2: Syncing Monitor Runs ──');
    
    const collectionResults = await Promise.all(
      xrayCollections.map(async (collection) => {
        try {
          return await syncMonitorRunsJob.syncCollectionMonitors({ collection, jobId });
        } catch (error) {
          console.error(`Error syncing ${collection.name}: ${error.message}`);
          return {
            collectionUid: collection.uid,
            collectionName: collection.name,
            error: error.message,
            runsSynced: 0,
            runsFailed: 0
          };
        }
      })
    );

    for (const r of collectionResults) {
      results.collections.push(r);
      results.totalSynced += r.runsSynced || 0;
      results.totalFailed += r.runsFailed || 0;
    }

    // Complete job
    let jobStatus = 'success';
    if (results.totalFailed > 0 && results.totalSynced > 0) jobStatus = 'partial';
    else if (results.totalFailed > 0 && results.totalSynced === 0) jobStatus = 'failed';
    await syncState.completeSyncJob(jobId, jobStatus);

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`✓ SYNC COMPLETE - ${results.totalSynced} synced, ${results.totalFailed} failed`);
    console.log('════════════════════════════════════════════════════════════════\n');

    return {
      ...results,
      jobId
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
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<Array>} - Collections to sync
 */
async function getXrayLinkedCollections(workspaceId) {
  if (!workspaceId) {
    throw new Error('workspaceId is required');
  }

  console.log('\n── Step 1: Fetching Xray-linked Collections ──');
  const allCollections = await postmanClient.getCollectionsWithVariables(workspaceId);
  const xrayCollections = postmanClient.filterXrayLinkedCollections(allCollections);
  
  console.log(`Found ${allCollections.length} collections, ${xrayCollections.length} linked to Xray`);
  
  if (xrayCollections.length === 0) {
    console.log('No collections linked to Xray. Add test-plan-id variable to collections.');
  }
  
  for (const c of xrayCollections) {
    const testPlanId = c.variable?.find(v => v.key === 'test-plan-id')?.value || null;
    console.log(`• ${c.name} → ${testPlanId}`);
  }

  return xrayCollections;
}
