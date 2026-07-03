import { ApiError } from './api/client';
import { captureError } from './sentry';

/**
 * Extract a domain error code from an ApiError, if the backend included one.
 * Returns undefined for non-ApiError or for errors without a `code` field.
 *
 * Backends throw `new BadRequestException({ detail, code: 'XYZ' })` and the
 * global filter spreads `code` into the response body alongside `detail`.
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (error instanceof ApiError && typeof error.data?.code === 'string') {
    return error.data.code;
  }
  return undefined;
}

/**
 * Extracts a user-friendly error message from any error.
 *
 * Priority:
 * 1. Known HTTP status → predefined message
 * 2. Backend `detail` field (now guaranteed user-friendly after backend hardening)
 * 3. Network errors → connection message
 * 4. Fallback → generic message
 *
 * NEVER returns raw error.message for non-ApiError — that could contain
 * stack traces, Prisma details, or internal state.
 */
export function extractErrorMessage(error: unknown): string {
  // ApiError from our client — has status and structured data
  if (error instanceof ApiError) {
    // Use backend's sanitized detail if available
    const detail = error.data?.detail;

    switch (error.status) {
      case 401:
        return 'Your session has expired. Please log in again.';
      case 403:
        return "You don't have permission to perform this action.";
      case 404:
        return detail || 'This record was not found. It may have been deleted.';
      case 409:
        return detail || 'A record with this value already exists.';
      case 422:
        return detail || 'The submitted data is invalid. Please check your input.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      default:
        if (error.status >= 500) {
          return 'Something went wrong on our end. Please try again.';
        }
        return detail || 'Request failed. Please try again.';
    }
  }

  // Network errors (fetch failures, CORS, DNS, etc.)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'Unable to reach the server. Please check your connection.';
  }

  // Unknown errors — log for debugging, show generic message
  captureError(error, { source: 'extractErrorMessage' });
  return 'Something went wrong. Please try again.';
}

/**
 * Extract field-level validation errors from backend response.
 * Returns undefined if no field errors present.
 *
 * Usage with react-hook-form:
 * ```
 * const fieldErrors = extractFieldErrors(error);
 * if (fieldErrors) {
 *   Object.entries(fieldErrors).forEach(([field, msg]) => {
 *     form.setError(field, { message: msg });
 *   });
 * }
 * ```
 */
export function extractFieldErrors(error: unknown): Record<string, string> | undefined {
  if (error instanceof ApiError && error.data?.fieldErrors) {
    return error.data.fieldErrors;
  }
  return undefined;
}
