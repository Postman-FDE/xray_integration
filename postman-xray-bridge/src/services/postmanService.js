/**
 * Postman API Service
 * 
 * Handles communication with Postman API to fetch collections and runs.
 * 
 * Real APIs:
 *   - GET /collections?workspace={id} - List collections (real)
 *   - GET /collections/{uid} - Get collection details with variables (real)
 * 
 * Mocked APIs (don't exist yet):
 *   - GET /collections/{uid}/runs - List runs for a collection
 *   - GET /collections/{uid}/runs/{runId} - Get run results
 */

import config from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POSTMAN_API_BASE = 'https://api.getpostman.com';

/**
 * Make authenticated request to Postman API
 */
async function postmanFetch(endpoint) {
  if (!config.postmanApiKey) {
    throw new Error('POSTMAN_API_KEY not configured');
  }

  const url = `${POSTMAN_API_BASE}${endpoint}`;
  console.log(`[PostmanService] GET ${url}`);

  const response = await fetch(url, {
    headers: {
      'X-Api-Key': config.postmanApiKey
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Postman API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Get all collections in a workspace
 * 
 * API: GET https://api.getpostman.com/collections?workspace={workspaceId}
 * 
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<Array>} - List of collections (without variables)
 */
export async function getCollections(workspaceId) {
  console.log(`[PostmanService] Fetching collections for workspace ${workspaceId}`);
  
  const data = await postmanFetch(`/collections?workspace=${workspaceId}`);
  
  // API returns { collections: [...] }
  const collections = data.collections || [];
  console.log(`[PostmanService] Found ${collections.length} collections`);
  
  return collections;
}

/**
 * Get collection details including variables
 * 
 * API: GET https://api.getpostman.com/collections/{collectionUid}
 * 
 * @param {string} collectionUid - Collection UID
 * @returns {Promise<Object>} - Collection details with variables
 */
export async function getCollection(collectionUid) {
  console.log(`[PostmanService] Fetching collection details: ${collectionUid}`);
  
  const data = await postmanFetch(`/collections/${collectionUid}`);
  
  // API returns { collection: { info: {...}, item: [...], variable: [...] } }
  const collection = data.collection || {};
  
  return {
    uid: collectionUid,
    name: collection.info?.name,
    variable: collection.variable || [],
    item: collection.item || []
  };
}

/**
 * Get collections with their variables (requires fetching each one)
 * 
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<Array>} - Collections with variables populated
 */
export async function getCollectionsWithVariables(workspaceId) {
  // Step 1: Get list of collections (no variables in this response)
  const collections = await getCollections(workspaceId);
  
  // Step 2: Fetch each collection to get variables
  console.log(`[PostmanService] Fetching details for ${collections.length} collections...`);
  
  const collectionsWithVars = await Promise.all(
    collections.map(async (c) => {
      try {
        const details = await getCollection(c.uid);
        return {
          ...c,
          variable: details.variable,
          item: details.item
        };
      } catch (error) {
        console.warn(`[PostmanService] Failed to fetch ${c.uid}: ${error.message}`);
        return { ...c, variable: [], item: [] };
      }
    })
  );
  
  return collectionsWithVars;
}

// ============================================================================
// MOCK: getCollectionRuns
// This API does not exist yet. Replace with real API when available.
// ============================================================================
/**
 * Get runs for a collection (paginated)
 * 
 * ⚠️ MOCK - API DOES NOT EXIST YET
 * 
 * Expected API: GET /collections/{uid}/runs?since={lastRunId}&limit=10
 * 
 * @param {string} collectionUid - Collection UID
 * @param {Object} options - Query options
 * @param {string} options.since - Fetch runs after this run ID
 * @param {number} options.limit - Max runs to return
 * @returns {Promise<Object>} - { runs: [], nextCursor: null }
 */
export async function getCollectionRuns(collectionUid, options = {}) {
  const { since, limit = 10 } = options;
  
  console.log(`[PostmanService] MOCK: Fetching runs for collection ${collectionUid} since=${since}`);
  
  // MOCK: Generate a new run with current timestamp
  // This simulates a new collection run happening each time
  const runId = `run-${Date.now()}`;
  const mockRuns = [
    {
      id: runId,
      collectionUid,
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      source: 'manual'
    }
  ];
  
  // Filter out runs we've already synced (if 'since' provided)
  // Compare timestamps (IDs are like run-1734398400000)
  const newRuns = since 
    ? mockRuns.filter(r => {
        const sinceTs = parseInt(since.replace('run-', ''), 10) || 0;
        const runTs = parseInt(r.id.replace('run-', ''), 10) || 0;
        return runTs > sinceTs;
      })
    : mockRuns;
  
  console.log(`[PostmanService] MOCK: Returning ${newRuns.length} runs (filtered from ${mockRuns.length})`);
  
  return {
    runs: newRuns.slice(0, limit),
    nextCursor: null // For pagination
  };
}

// ============================================================================
// MOCK: getRunResults
// This API does not exist yet. Replace with real API when available.
// Currently reads from: test-results/postman-cli/loanflow-results.json
// ============================================================================
/**
 * Get run results/details
 * 
 * ⚠️ MOCK - API DOES NOT EXIST YET
 * 
 * Expected API: GET /collections/{uid}/runs/{runId}
 * 
 * @param {string} collectionUid - Collection UID
 * @param {string} runId - Run ID
 * @returns {Promise<Object>} - Run results in JSON format (Postman CLI structure)
 */
export async function getRunResults(collectionUid, runId) {
  console.log(`[PostmanService] MOCK: Fetching results for run ${runId}`);
  
  // MOCK: Read from actual Postman CLI JSON output
  const mockFilePath = path.join(__dirname, '../../test-results/postman-cli/loanflow-results.json');
  
  try {
    const fileContent = fs.readFileSync(mockFilePath, 'utf-8');
    const results = JSON.parse(fileContent);
    
    // Add metadata that would come from the API
    return {
      runId,
      collectionUid,
      ...results
    };
  } catch (error) {
    console.warn(`[PostmanService] MOCK: Could not read ${mockFilePath}: ${error.message}`);
    
    // Fallback to minimal mock
    return {
      runId,
      collectionUid,
      run: {
        meta: {
          collectionName: 'LoanFlow Tests (mock fallback)'
        },
        executions: [],
        summary: { total: 0, passed: 0, failed: 0 }
      }
    };
  }
}

/**
 * Filter collections that have test-plan-id variable
 * @param {Array} collections - List of collections
 * @returns {Array} - Filtered collections linked to Xray
 */
export function filterXrayLinkedCollections(collections) {
  return collections.filter(c => 
    c.variable?.some(v => v.key === 'test-plan-id')
  );
}

/**
 * Get test-plan-id from collection variables
 * @param {Object} collection - Collection object
 * @returns {string|null} - Test plan ID or null
 */
export function getTestPlanId(collection) {
  const variable = collection.variable?.find(v => v.key === 'test-plan-id');
  return variable?.value || null;
}

/**
 * Build a map of request ID → folder name
 * This is needed because Postman CLI JSON doesn't include folder names directly.
 * The folder name contains the test_key (e.g., "SJP-2 | Create Loan")
 * 
 * @param {Object} collection - Collection object with item array
 * @returns {Object} - Map of request ID to folder name
 */
export function buildFolderMap(collection) {
  const folderMap = {};
  
  if (!collection.item || !Array.isArray(collection.item)) {
    console.log('[buildFolderMap] No items found in collection');
    return folderMap;
  }
  
  console.log(`[buildFolderMap] Processing ${collection.item.length} top-level items`);
  
  // Iterate through folders (top-level items that have nested items)
  for (const folder of collection.item) {
    const folderName = folder.name;
    
    // Check if this is a folder (has nested items)
    if (folder.item && Array.isArray(folder.item)) {
      for (const request of folder.item) {
        if (request.id) {
          folderMap[request.id] = folderName;
        }
      }
    }
  }
  
  console.log(`[buildFolderMap] Mapped ${Object.keys(folderMap).length} requests to folders`);
  
  return folderMap;
}

