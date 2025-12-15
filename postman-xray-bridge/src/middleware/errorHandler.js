/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ApiError';
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends ApiError {
  constructor(message, details = null) {
    super(400, message, details);
    this.name = 'ValidationError';
  }
}

/**
 * Xray API Error (502)
 */
export class XrayApiError extends ApiError {
  constructor(message, details = null) {
    super(502, message, details);
    this.name = 'XrayApiError';
  }
}

/**
 * Global error handling middleware
 */
export function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${err.name}: ${err.message}`);
  if (process.env.NODE_ENV === 'development' && err.stack) {
    console.error(err.stack);
  }

  // Handle known API errors
  if (err instanceof ApiError) {
    const response = { error: err.message };
    if (err.details) {
      response.details = err.details;
    }
    return res.status(err.statusCode).json(response);
  }

  // Handle multer errors (file upload)
  if (err.name === 'MulterError') {
    return res.status(400).json({
      error: `File upload error: ${err.message}`,
    });
  }

  // Handle unexpected errors
  res.status(500).json({ error: 'Internal server error' });
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
  });
}

