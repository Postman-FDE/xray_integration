/**
 * Configuration for postman-xray-bridge
 * 
 * Set these via environment variables:
 *   XRAY_CLIENT_ID - Your Xray Cloud API client ID
 *   XRAY_CLIENT_SECRET - Your Xray Cloud API client secret
 *   XRAY_BASE_URL - Xray Cloud base URL (default: https://xray.cloud.getxray.app)
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

