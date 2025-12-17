/**
 * Jobs Controller
 * 
 * Handles sync job management endpoints.
 */

import * as scheduler from '../jobs/scheduler.js';
import * as syncState from '../store/syncState.js';
import config from '../config.js';

/**
 * POST /jobs/sync/run
 * 
 * Manually trigger a sync job
 */
export async function runSync(req, res, next) {
  try {
    // Support both single workspaceId and array of workspaceIds
    let workspaceIds = req.body.workspaceIds || 
                       (req.body.workspaceId ? [req.body.workspaceId] : null) ||
                       config.postmanWorkspaceIds;
    
    if (!workspaceIds || workspaceIds.length === 0) {
      return res.status(400).json({
        error: 'No workspace ID(s) provided. Pass workspaceId/workspaceIds in body or set POSTMAN_WORKSPACE_IDS.'
      });
    }
    
    console.log(`[JobsController] Manual sync triggered for ${workspaceIds.length} workspace(s): ${workspaceIds.join(', ')}`);
    
    const result = await scheduler.runNow(workspaceIds);
    
    res.json({
      success: true,
      message: 'Sync job completed',
      result
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /jobs/sync/status
 * 
 * Get sync job status and state
 */
export function getStatus(req, res) {
  const state = syncState.getFullState();
  
  res.json({
    scheduler: {
      running: scheduler.isSchedulerRunning(),
      cronExpression: config.sync.cronExpression,
      workspaceIds: config.postmanWorkspaceIds.length > 0 
        ? config.postmanWorkspaceIds 
        : '(not configured)'
    },
    state: {
      lastRun: state.lastRun,
      collectionsTracked: Object.keys(state.collections).length,
      collections: state.collections
    }
  });
}

/**
 * POST /jobs/sync/start
 * 
 * Start the scheduler
 */
export function startScheduler(req, res) {
  let workspaceIds = req.body.workspaceIds || 
                     (req.body.workspaceId ? [req.body.workspaceId] : null) ||
                     config.postmanWorkspaceIds;
  const cronExpression = req.body.cronExpression || config.sync.cronExpression;
  
  if (!workspaceIds || workspaceIds.length === 0) {
    return res.status(400).json({
      error: 'No workspace ID(s) provided. Pass workspaceIds in body or set POSTMAN_WORKSPACE_IDS.'
    });
  }
  
  if (scheduler.isSchedulerRunning()) {
    return res.json({
      success: false,
      message: 'Scheduler is already running'
    });
  }
  
  scheduler.startScheduler({ workspaceIds, cronExpression });
  
  res.json({
    success: true,
    message: 'Scheduler started',
    cronExpression,
    workspaceIds
  });
}

/**
 * POST /jobs/sync/stop
 * 
 * Stop the scheduler
 */
export function stopScheduler(req, res) {
  if (!scheduler.isSchedulerRunning()) {
    return res.json({
      success: false,
      message: 'Scheduler is not running'
    });
  }
  
  scheduler.stopScheduler();
  
  res.json({
    success: true,
    message: 'Scheduler stopped'
  });
}

/**
 * POST /jobs/sync/reset
 * 
 * Reset all sync state
 */
export function resetState(req, res) {
  syncState.resetState();
  res.json({
    success: true,
    message: 'Sync state reset'
  });
}

