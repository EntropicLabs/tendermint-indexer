import { sleep } from "../utils/sleep";

export type FailureHandler<T> = (
  error: unknown,
  attempt: number,
) => T | Promise<T>;

export type WrapOptions = {
  onFailedAttempt?: FailureHandler<void>;
  onFailedLastAttempt?: FailureHandler<void>;
};

export interface Retrier {
  wrap<T = unknown>(
    callback: (
      success: () => void,
      retry: (error: unknown) => Promise<T>,
    ) => Promise<T> | T,
    options?: WrapOptions,
  ): Promise<T>;
}

export interface ErrorRetrier {
  wrap<T = unknown>(
    callback: () => Promise<T> | T,
    options?: WrapOptions,
  ): Promise<T>;
}

export type BaseRetrierOptions = {
  maxRetries?: number;
};

export type IntervalRetrierOptions = BaseRetrierOptions & {
  interval: number;
  jitter?: number;
};

export type ExpBackoffRetrierOptions = BaseRetrierOptions & {
  expFactor: number;
  initialInterval: number;
  jitter?: number;
  maxInterval?: number;
};

function createShouldRetry({
  maxRetries,
}: BaseRetrierOptions): (error: unknown, attempt: number) => boolean {
  return maxRetries == null ? () => true : (_, attempt) => attempt < maxRetries;
}

const createRetrier = (
  options: BaseRetrierOptions,
  getNextInterval: (attempt: number) => number,
): Retrier => {
  return {
    wrap: async <T>(
      callback: (
        success: () => void,
        error: (error: unknown) => Promise<T>,
      ) => Promise<T> | T,
      { onFailedAttempt, onFailedLastAttempt }: WrapOptions = {},
    ): Promise<T> => {
      const shouldRetry = createShouldRetry(options);
      let attempt = 0;

      const success = () => {
        attempt = 0;
      };

      const retry = async (error: unknown) => {
        if (!(await shouldRetry(error, attempt))) {
          await onFailedLastAttempt?.(error, attempt + 1);
          throw error;
        }
        await onFailedAttempt?.(error, attempt);
        await sleep(getNextInterval(attempt++));
        return await callback(success, retry);
      };

      return await callback(success, retry);
    },
  };
};

export const createErrorRetrier = (retrier: Retrier): ErrorRetrier => {
  return {
    wrap: async <T>(
      callback: () => Promise<T> | T,
      { onFailedAttempt, onFailedLastAttempt }: WrapOptions = {},
    ): Promise<T> => {
      return retrier.wrap(
        async (success, retry) => {
          try {
            const data = await callback();
            success();
            return data;
          } catch (error) {
            return await retry(error);
          }
        },
        {
          onFailedAttempt,
          onFailedLastAttempt,
        },
      );
    },
  };
};

export const createExpBackoffRetrier = (
  options: Partial<ExpBackoffRetrierOptions> = {},
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
      maxInterval ?? Infinity,
    ),
  );
};
