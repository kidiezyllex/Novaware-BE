/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {string} message - Success message
 * @param {Object} data - Response data
 */
export const sendSuccess = (res, statusCode = 200, message = "Success", data = {}) => {
  res.status(statusCode).json({
    status: "success",
    message,
    data
  });
};

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {string} message - Error message
 * @param {Object} data - Additional error data (optional)
 */
export const sendError = (res, statusCode = 500, message = "Internal Server Error", data = {}) => {
  res.status(statusCode).json({
    status: "error",
    message,
    data
  });
};

/**
 * Send validation error response
 * @param {Object} res - Express response object
 * @param {string} message - Validation error message
 * @param {Object} data - Validation error details (optional)
 */
export const sendValidationError = (res, message = "Validation Error", data = {}) => {
  res.status(400).json({
    status: "error",
    message,
    data
  });
};

/**
 * Send not found error response
 * @param {Object} res - Express response object
 * @param {string} message - Not found message
 * @param {Object} data - Additional data (optional)
 */
export const sendNotFound = (res, message = "Resource not found", data = {}) => {
  res.status(404).json({
    status: "error",
    message,
    data
  });
};

/**
 * Send unauthorized error response
 * @param {Object} res - Express response object
 * @param {string} message - Unauthorized message
 * @param {Object} data - Additional data (optional)
 */
export const sendUnauthorized = (res, message = "Unauthorized", data = {}) => {
  res.status(401).json({
    status: "error",
    message,
    data
  });
};

/**
 * Send forbidden error response
 * @param {Object} res - Express response object
 * @param {string} message - Forbidden message
 * @param {Object} data - Additional data (optional)
 */
export const sendForbidden = (res, message = "Forbidden", data = {}) => {
  res.status(403).json({
    status: "error",
    message,
    data
  });
};

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {string} message - Created message
 * @param {Object} data - Created resource data
 */
export const sendCreated = (res, message = "Resource created successfully", data = {}) => {
  res.status(201).json({
    status: "success",
    message,
    data
  });
};

/**
 * Send no content response
 * @param {Object} res - Express response object
 * @param {string} message - No content message
 */
export const sendNoContent = (res, message = "No content") => {
  res.status(204).json({
    status: "success",
    message,
    data: {}
  });
};
