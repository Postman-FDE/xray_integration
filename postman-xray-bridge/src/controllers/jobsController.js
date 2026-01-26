/**
 * Jobs Controller
 * 
 * Handles sync job management endpoints.
 */

import * as scheduler from '../workflows/scheduler.js';
import * as syncState from '../store/syncState.js';
import config from '../config.js';

/**
 * POST /sync/run/mock
 * 
 * Manually trigger a sync job using mock APIs (legacy)
 */
export async function runSync(req, res, next) {
  try {
    // Support both single workspaceId and array of workspaceIds
    let workspaceIds = req.body.workspaceIds || 
                       (req.body.workspaceId ? [req.body.workspaceId] : null) ||
                       config.postman.workspaceIds;
    
    if (!workspaceIds || workspaceIds.length === 0) {
      return res.status(400).json({
        error: 'No workspace ID(s) provided. Pass workspaceId/workspaceIds in body or set POSTMAN_WORKSPACE_IDS.'
      });
    }
    
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
 * GET /scheduler/status
 * 
 * Get scheduler and sync state
 */
export async function getStatus(req, res, next) {
  try {
    const state = await syncState.getFullState();
    const recentJobs = await syncState.getRecentJobs(5);
    
    res.json({
      scheduler: {
        running: scheduler.isSchedulerRunning(),
        cronExpression: config.sync.cronExpression,
        workspaceIds: config.postman.workspaceIds.length > 0 
          ? config.postman.workspaceIds 
          : '(not configured)'
      },
      state: {
        lastRun: state.lastRun,
        collectionsTracked: Object.keys(state.collections).length,
        collections: state.collections
      },
      recentJobs: recentJobs.map(job => ({
        id: job.id,
        startedAt: job.startedAt,
        endedAt: job.endedAt,
        status: job.status,
        runsTotal: job.runsTotal,
        runsSuccess: job.runsSuccess,
        runsFailed: job.runsFailed
      }))
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /scheduler/start
 * 
 * Start the scheduler
 */
export function startScheduler(req, res) {
  let workspaceIds = req.body.workspaceIds || 
                     (req.body.workspaceId ? [req.body.workspaceId] : null) ||
                     config.postman.workspaceIds;
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
 * POST /scheduler/stop
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
 * POST /scheduler/reset
 * 
 * Reset all sync state
 */
export async function resetState(req, res, next) {
  try {
    await syncState.resetState();
    res.json({
      success: true,
      message: 'Sync state reset'
    });
  } catch (error) {
    next(error);
  }
}

