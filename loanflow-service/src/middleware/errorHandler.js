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
 * Not Found Error (404)
 */
export class NotFoundError extends ApiError {
  constructor(resource, id) {
    super(404, `${resource} with ID '${id}' not found`);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends ApiError {
  constructor(message) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends ApiError {
  constructor(errors) {
    super(400, 'Validation failed', errors);
    this.name = 'ValidationError';
  }
}

/**
 * Global error handling middleware
 */
export function errorHandler(err, req, res, next) {
  // Log the error for debugging
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

  // Handle Zod validation errors (if any slip through)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  // Handle unexpected errors
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({ error: message });
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
  });
}

