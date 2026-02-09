/**
 * Configuration for postman-xray-bridge
 * 
 * All environment variables are centralized here.
 * 
 * Required:
 *   XRAY_CLIENT_ID - Your Xray Cloud API client ID
 *   XRAY_CLIENT_SECRET - Your Xray Cloud API client secret
 * 
 * Optional:
 *   XRAY_BASE_URL - Xray Cloud base URL (default: https://xray.cloud.getxray.app)
 *   PM_API_KEY - Your Postman API key
 *   POSTMAN_API_URL - Postman API base URL (default: https://api.getpostman.com)
 *   POSTMAN_WORKSPACE_IDS - Comma-separated workspace IDs (e.g., ws-id-1,ws-id-2)
 *   POSTMAN_MOCK_URL - Mock API URL for testing
 *   MONITOR_API_URL - Monitor/Newman API URL (default: http://localhost:8080)
 *   X_ACCESS_TOKEN - Auth token for Monitor API
 *   COLLECTION_RUN_API_URL - Collection Run API URL (default: http://localhost:8081)
 *   JIRA_EMAIL - Jira email for API auth
 *   JIRA_API_TOKEN - Jira API token
 *   JIRA_BASE_URL - Jira base URL (default: https://postmanlabs.atlassian.net)
 *   SYNC_CRON - Cron expression (default: every hour)
 *   SYNC_ENABLED - Enable auto-sync on startup (default: false)
 *   SYNC_BASE_TIME - Only sync runs after this timestamp
 *   DRY_RUN - Push to Xray but don't update DB (default: false)
 *   PORT - Server port (default: 4000)
 */

export const config = {
  // Database settings
  database: {
    url: process.env.DATABASE_URL || '',
  },

  // Xray Cloud API settings
  xray: {
    clientId: process.env.XRAY_CLIENT_ID || '',
    clientSecret: process.env.XRAY_CLIENT_SECRET || '',
    baseUrl: process.env.XRAY_BASE_URL || 'https://xray.cloud.getxray.app',
  },

  // Jira API settings (for test resolution)
  jira: {
    email: process.env.JIRA_EMAIL || '',
    apiToken: process.env.JIRA_API_TOKEN || '',
    baseUrl: process.env.JIRA_BASE_URL || 'https://postmanlabs.atlassian.net',
  },

  // Postman Public API settings
  postman: {
    apiKey: process.env.PM_API_KEY || '',
    apiUrl: process.env.POSTMAN_API_URL || 'https://api.getpostman.com',
    mockUrl: process.env.POSTMAN_MOCK_URL || null,
    workspaceIds: (process.env.POSTMAN_WORKSPACE_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0),
  },

  // Monitor API settings (newman-remote-api)
  monitor: {
    apiUrl: process.env.NEWMAN_REMOTE_API_URL || 'http://localhost:8080',
    accessToken: process.env.X_ACCESS_TOKEN || '',
  },

  // Collection Run API settings (history-service)
  collectionRun: {
    apiUrl: process.env.COLLECTION_RUN_API_URL || 'http://localhost:8081',
  },

  // Sync job settings
  sync: {
    enabled: process.env.SYNC_ENABLED === 'true',
    cronExpression: process.env.SYNC_CRON || '0 * * * *',
    dryRun: process.env.DRY_RUN === 'true',
    baseTime: process.env.SYNC_BASE_TIME || null,
  },

  // Server settings
  server: {
    port: parseInt(process.env.PORT || '3003', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
};

/**
 * Validate required configuration
 */
export function validateConfig() {
  const missing = [];

  if (!config.xray.clientId) {
    missing.push('XRAY_CLIENT_ID');
  }
  if (!config.xray.clientSecret) {
    missing.push('XRAY_CLIENT_SECRET');
  }

  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
    console.warn('   Xray sync will fail until these are configured.');
    return false;
  }

  return true;
}

export default config;

