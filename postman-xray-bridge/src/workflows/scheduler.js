/**
 * Cron Scheduler
 * 
 * Schedules the sync job to run periodically.
 */

import cron from 'node-cron';
import { runSyncJob } from './mockSyncJob.js';
import config from '../config.js';

let scheduledTask = null;

/**
 * Start the scheduler
 * @param {Object} options - Scheduler options
 * @param {string[]} options.workspaceIds - Postman workspace IDs to sync
 * @param {string} options.cronExpression - Cron expression (default: every hour)
 */
export function startScheduler(options = {}) {
  const {
    workspaceIds = config.postman.workspaceIds,
    cronExpression = '0 * * * *' // Every hour at minute 0
  } = options;

  if (!workspaceIds || workspaceIds.length === 0) {
    console.warn('[Scheduler] No workspace IDs configured. Scheduler not started.');
    console.warn('[Scheduler] Set POSTMAN_WORKSPACE_IDS in .env to enable auto-sync.');
    return;
  }

  if (scheduledTask) {
    console.warn('[Scheduler] Scheduler already running. Stop it first.');
    return;
  }

  console.log('[Scheduler] Starting scheduler...');
  console.log(`[Scheduler] Cron expression: ${cronExpression}`);
  console.log(`[Scheduler] Workspace IDs: ${workspaceIds.join(', ')}`);

  scheduledTask = cron.schedule(cronExpression, async () => {
    console.log(`[Scheduler] Triggered at ${new Date().toISOString()}`);
    
    try {
      const results = await runNow(workspaceIds);
      const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
      console.log(`[Scheduler] Job completed. Synced ${totalSynced} runs across ${workspaceIds.length} workspace(s).`);
    } catch (error) {
      console.error('[Scheduler] Job failed:', error.message);
    }
  });

  console.log('[Scheduler] Scheduler started! Next run at the top of the hour.');
}

/**
 * Stop the scheduler
 */
export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[Scheduler] Scheduler stopped.');
  }
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning() {
  return scheduledTask !== null;
}

/**
 * Run sync job immediately
 * @param {string|string[]} workspaceIds - Workspace ID(s) (uses config if not provided)
 * @returns {Promise<Array>} - Results for each workspace
 */
export async function runNow(workspaceIds) {
  // Normalize to array
  let wsIds = Array.isArray(workspaceIds) 
    ? workspaceIds 
    : workspaceIds 
      ? [workspaceIds] 
      : config.postman.workspaceIds;
  
  if (!wsIds || wsIds.length === 0) {
    throw new Error('No workspace ID(s) provided or configured');
  }
  
  const results = [];
  
  for (const wsId of wsIds) {
    try {
      const result = await runSyncJob(wsId);
      results.push(result);
    } catch (error) {
      console.error(`[Scheduler] Error syncing workspace ${wsId}:`, error.message);
      results.push({ workspaceId: wsId, error: error.message, synced: 0 });
    }
  }
  
  return results;
}

