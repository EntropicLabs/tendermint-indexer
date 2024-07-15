import { sleep } from "../utils/sleep";

/**
 * Handler for a failure callback
 */
type FailureHandler = (error: unknown, attempt: number) => void;

/**
 * Failure callbacks when retries are invoked
 */
type WrapOptions = {
  onFailedAttempt?: FailureHandler;
  onFailedLastAttempt?: FailureHandler;
};

/**
 * General retrier that retries callback when the retry function is invoked
 */
export interface Retrier {
  wrap<T = unknown>(
    callback: (
      success: () => void,
      retry: (error: unknown) => Promise<T>
    ) => Promise<T> | T,
    options?: WrapOptions
  ): Promise<T>;
}

/**
 * A retrier that catches errors and retries
 */
export interface ErrorRetrier {
  wrap<T = unknown>(
    callback: () => Promise<T> | T,
    options?: WrapOptions
  ): Promise<T>;
}

type BaseRetrierOptions = {
  /**
   * Maximum number of retries before stopping and throwing an error
   */
  maxRetries?: number;
};

type ExpBackoffRetrierOptions = BaseRetrierOptions & {
  /**
   * Exponential factor in exponential backoff
   */
  expFactor: number;
  /**
   * Initial interval in exponential backoff
   */
  initialInterval: number;
  /**
   * Random jitter added to the time to wait
   */
  jitter?: number;
  /**
   * Maximum threshold before switching to linear backoff
   */
  maxInterval?: number;
};

/**
 * Creates a function that checks if another retry is neccessary
 * @param maxRetries Maximum number of retries before stopping and throwing an error
 * @returns Function that returns true if another retry is necessary
 */
function createShouldRetry({
  maxRetries,
}: BaseRetrierOptions): (error: unknown, attempt: number) => boolean {
  return maxRetries == null ? () => true : (_, attempt) => attempt < maxRetries;
}

/**
 * Creates a retrier with success and retry callbacks
 * @param options retrier options
 * @param getNextInterval function for fetching time to wait before another retry
 * @returns Wrapper around logic that needs to be retried
 */
export const createRetrier = (
  options: BaseRetrierOptions,
  getNextInterval: (attempt: number) => number
): Retrier => {
  return {
    wrap: async <T>(
      callback: (
        success: () => void,
        retry: (error: unknown) => Promise<T>
      ) => Promise<T> | T,
      { onFailedAttempt, onFailedLastAttempt }: WrapOptions = {}
    ): Promise<T> => {
      const shouldRetry = createShouldRetry(options);
      let attempt = 0;

      const success = () => {
        // Reset attempt counter
        attempt = 0;
      };

      const retry = async (error: unknown) => {
        if (!(await shouldRetry(error, attempt))) {
          // Throw an error on the last retry attempt
          await onFailedLastAttempt?.(error, attempt + 1);
          throw error;
        }
        await onFailedAttempt?.(error, attempt);
        await sleep(getNextInterval(attempt++));
        // Retries callback logic
        return await callback(success, retry);
      };

      // Try callback logic for the first time
      return await callback(success, retry);
    },
  };
};

/**
 * Creates a retrier that catches errors and triggers retries on thrown errors
 * @param retrier Basic retrier
 * @returns An error retrier wrapped around the basic retrier
 */
export const createErrorRetrier = (retrier: Retrier): ErrorRetrier => {
  return {
    wrap: async <T>(
      callback: () => Promise<T> | T,
      { onFailedAttempt, onFailedLastAttempt }: WrapOptions = {}
    ): Promise<T> => {
      return retrier.wrap(
        async (success, retry) => {
          try {
            const data = await callback();
            success();
            return data;
          } catch (error) {
            // Retry callback logic
            return await retry(error);
          }
        },
        {
          onFailedAttempt,
          onFailedLastAttempt,
        }
      );
    },
  };
};

/**
 * Creates an exponential backoff retrier
 * @param options Exponential backoff options
 * @returns Exponential backoff retrier
 */
export const createExpBackoffRetrier = (
  options: Partial<ExpBackoffRetrierOptions> = {}
): Retrier => {
  const {
    initialInterval = 1000,
    expFactor = 2,
    jitter = 0,
    maxInterval,
  } = options;
  return createRetrier(options, (attempt) =>
    Math.min(
      initialInterval * Math.pow(expFactor, attempt) + Math.random() * jitter,
      maxInterval ?? Infinity
    )
  );
};
