/**
 * Retry utilities with exponential backoff
 */

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,  // 1 second
  maxDelayMs: 10000,     // 10 seconds
  backoffMultiplier: 2   // exponential backoff
};

/**
 * Sleep for a given number of milliseconds
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry and exponential backoff
 * 
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Options
 * @param {string} options.operationName - Name for logging
 * @param {Object} options.config - Override default retry config
 * @param {Function} options.shouldRetry - Custom function to determine if error is retryable
 * @returns {Promise} - Result of the function
 */
export async function withRetry(fn, options = {}) {
  const {
    operationName = 'Operation',
    config = DEFAULT_RETRY_CONFIG,
    shouldRetry = defaultShouldRetry
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error;
      }
      
      if (attempt < config.maxRetries) {
        const delay = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );
        console.log(`${operationName} failed (attempt ${attempt}/${config.maxRetries}), retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Default function to determine if an error is retryable
 * Don't retry on auth errors or validation errors (4xx)
 * 
 * @param {Error} error - The error to check
 * @returns {boolean} - True if should retry
 */
function defaultShouldRetry(error) {
  const message = error.message || '';
  // Don't retry on client errors (4xx) - match patterns like "(400)" or ": 400 -"
  const clientErrorPattern = /\b(400|401|403|404|422)\b/;
  if (clientErrorPattern.test(message)) {
    return false;
  }
  return true;
}
