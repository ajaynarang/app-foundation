import { Injectable, Logger } from '@nestjs/common';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  retryableErrors?: string[];
}

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  async withRetry<T>(operation: () => Promise<T>, options: RetryOptions, context: string): Promise<T> {
    const {
      maxAttempts = 3,
      baseDelayMs = 1000,
      maxDelayMs = 30000,
      exponentialBase = 2,
      retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'],
    } = options;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(`${context}: Attempt ${attempt}/${maxAttempts}`);
        return await operation();
      } catch (error) {
        lastError = error;

        // Don't retry non-retryable errors
        if (!this.isRetryable(error, retryableErrors)) {
          this.logger.warn(`${context}: Non-retryable error, failing immediately`);
          throw error;
        }

        // Last attempt, throw error
        if (attempt === maxAttempts) {
          this.logger.error(`${context}: All ${maxAttempts} attempts failed`);
          throw error;
        }

        // Calculate delay with exponential backoff + jitter
        const baseDelay = baseDelayMs * Math.pow(exponentialBase, attempt - 1);
        const jitter = Math.random() * 0.3 * baseDelay;
        const delay = Math.min(baseDelay + jitter, maxDelayMs);

        this.logger.warn(
          `${context}: Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms. Error: ${error.message}`,
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryable(error: any, retryableErrors: string[]): boolean {
    // Network errors (by code)
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }

    // Network errors (by message - for test compatibility)
    if (error.message) {
      for (const retryableError of retryableErrors) {
        if (error.message.includes(retryableError)) {
          return true;
        }
      }
    }

    // HTTP 429 (rate limit), 500, 502, 503, 504
    if (error.response?.status) {
      const status = error.response.status;
      return status === 429 || (status >= 500 && status < 600);
    }

    // Timeout errors
    if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
      return true;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
