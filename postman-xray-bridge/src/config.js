/**
 * Configuration for postman-xray-bridge
 * 
 * Set these via environment variables:
 *   XRAY_CLIENT_ID - Your Xray Cloud API client ID
 *   XRAY_CLIENT_SECRET - Your Xray Cloud API client secret
 *   XRAY_BASE_URL - Xray Cloud base URL (default: https://xray.cloud.getxray.app)
 *   POSTMAN_API_KEY - Your Postman API key
 *   POSTMAN_WORKSPACE_IDS - Comma-separated list of workspace IDs to sync
 *                           Example: ws-id-1,ws-id-2,ws-id-3
 *   SYNC_CRON - Cron expression for sync job (default: every hour)
 *   SYNC_ENABLED - Enable auto-sync on startup (default: false)
 *   PORT - Server port (default: 4000)
 */

export const config = {
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

  // Postman API settings
  postmanApiKey: process.env.POSTMAN_API_KEY || '',
  
  // Comma-separated list of workspace IDs to sync
  // Example: POSTMAN_WORKSPACE_IDS=ws-id-1,ws-id-2,ws-id-3
  postmanWorkspaceIds: (process.env.POSTMAN_WORKSPACE_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0),

  // Sync job settings
  sync: {
    enabled: process.env.SYNC_ENABLED === 'true',
    cronExpression: process.env.SYNC_CRON || '0 * * * *', // Every hour
    dryRun: process.env.DRY_RUN === 'true', // Push to Xray but don't update sync state
  },
  
  // Postman Mock URL (for testing with mock API)
  postmanMockUrl: process.env.POSTMAN_MOCK_URL || null,

  // Server settings
  server: {
    port: parseInt(process.env.PORT || '4000', 10),
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

