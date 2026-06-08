import { toast } from 'sonner';

/**
 * Standard toast utilities for mutation feedback.
 * Every mutation MUST call showSuccess() on success and showError() on error.
 *
 * Usage in mutation hooks:
 *   onSuccess: () => { showSuccess('Invoice sent'); },
 *   onError: (error: Error) => { showError('Failed to send invoice', error.message); },
 */

export function showSuccess(message: string) {
  toast.success(message);
}

export function showSuccessWithLink(message: string, linkLabel: string, href: string, jobId?: string) {
  const url = jobId ? `${href}${href.includes('?') ? '&' : '?'}jobId=${jobId}` : href;
  toast.success(message, {
    duration: 6000,
    action: {
      label: linkLabel,
      onClick: () => {
        window.location.href = url;
      },
    },
  });
}

export function showError(title: string, description?: string) {
  toast.error(title, { description, duration: 8000 });
}

export function showLoading(message: string): string | number {
  return toast.loading(message);
}

export function dismissToast(id: string | number) {
  toast.dismiss(id);
}

/**
 * Auto-extract a user-friendly message from an error and show as toast.
 * Used by the global MutationCache fallback. Can also be called directly.
 *
 * Handles ApiError (from frontend client), TypeError (network), and unknown errors.
 * Does NOT depend on error-utils.ts to avoid circular deps — keeps its own extraction logic.
 */
/** Structural type for errors with HTTP status + response data (e.g., ApiError). */
interface HttpErrorLike {
  status?: number;
  data?: { detail?: string };
}

function isHttpErrorLike(err: unknown): err is HttpErrorLike {
  return typeof err === 'object' && err !== null && 'status' in err;
}

export function showMutationError(error: unknown) {
  let message = 'Something went wrong. Please try again.';

  if (isHttpErrorLike(error)) {
    // ApiError from our client — has .data.detail (sanitized by backend)
    if (error.data?.detail) {
      message = error.data.detail;
    } else if (error.status === 401) {
      message = 'Your session has expired. Please log in again.';
    } else if (error.status === 403) {
      message = "You don't have permission to perform this action.";
    } else if (error.status === 429) {
      message = 'Too many requests. Please wait a moment and try again.';
    } else if (error.status && error.status >= 500) {
      message = 'Something went wrong on our end. Please try again.';
    }
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    message = 'Unable to reach the server. Please check your connection.';
  }

  toast.error(message, { duration: 8000 });
}

// Re-export raw toast for advanced usage (promise-based, custom, etc.)
export { toast };
