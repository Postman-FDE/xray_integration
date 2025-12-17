/**
 * Sync State Storage
 * 
 * Tracks the last synced run ID for each collection.
 * Uses a simple JSON file for persistence.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '../../data/sync-state.json');

// Ensure data directory exists
const dataDir = path.dirname(STATE_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Load sync state from file
 * @returns {Object} - Sync state
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[SyncState] Error loading state:', error.message);
  }
  
  return {
    collections: {},
    lastRun: null
  };
}

/**
 * Save sync state to file
 * @param {Object} state - State to save
 */
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[SyncState] Error saving state:', error.message);
    throw error;
  }
}

/**
 * Get last synced run ID for a collection
 * @param {string} collectionUid - Collection UID
 * @returns {string|null} - Last synced run ID or null
 */
export function getLastSyncedRunId(collectionUid) {
  const state = loadState();
  return state.collections[collectionUid]?.lastRunId || null;
}

/**
 * Update last synced run ID for a collection
 * @param {string} collectionUid - Collection UID
 * @param {string} runId - Run ID that was synced
 * @param {Object} metadata - Additional metadata
 */
export function updateLastSyncedRunId(collectionUid, runId, metadata = {}) {
  const state = loadState();
  
  state.collections[collectionUid] = {
    lastRunId: runId,
    lastSyncedAt: new Date().toISOString(),
    testPlanId: metadata.testPlanId || state.collections[collectionUid]?.testPlanId,
    collectionName: metadata.collectionName || state.collections[collectionUid]?.collectionName
  };
  
  state.lastRun = new Date().toISOString();
  
  saveState(state);
  console.log(`[SyncState] Updated ${collectionUid} → lastRunId: ${runId}`);
}

/**
 * Get full sync state
 * @returns {Object} - Full state object
 */
export function getFullState() {
  return loadState();
}

/**
 * Reset all sync state
 */
export function resetState() {
  saveState({ collections: {}, lastRun: null });
  console.log('[SyncState] Reset all state');
}

