import {
  createErrorRetrier,
  createExpBackoffRetrier,
  createRetrier,
} from "../src/modules/retry";
import { checkErrorThrow } from "./utils";

test("Setup and run basic retrier", async () => {
  const retrier = createRetrier(
    {
      maxRetries: 1,
    },
    () => 500
  );

  let counter = 0;

  expect(
    await checkErrorThrow(async () => {
      await retrier.wrap(
        async (_, retry) => {
          await retry(undefined);
        },
        {
          onFailedAttempt: () => {
            counter += 1;
          },
          onFailedLastAttempt: () => {
            counter += 2;
          },
        }
      );
    })
  ).toBe(true);

  expect(counter).toBe(3);
});

test("Setup and run error retrier", async () => {
  const retrier = createRetrier(
    {
      maxRetries: 1,
    },
    () => 500
  );

  let counter = 0;

  const errorRetrier = createErrorRetrier(retrier);

  expect(
    await checkErrorThrow(async () => {
      await errorRetrier.wrap(
        async () => {
          throw new Error();
        },
        {
          onFailedAttempt: () => {
            counter += 1;
          },
          onFailedLastAttempt: () => {
            counter += 2;
          },
        }
      );
    })
  ).toBe(true);

  expect(counter).toBe(3);
});

test("Setup and run exponential error retrier", async () => {
  const retrier = createExpBackoffRetrier({
    initialInterval: 1000,
    expFactor: 2,
    jitter: 0,
    maxRetries: 2,
  });

  let counter = 0;

  const errorRetrier = createErrorRetrier(retrier);

  var startTime = performance.now();
  expect(
    await checkErrorThrow(async () => {
      await errorRetrier.wrap(
        async () => {
          throw new Error();
        },
        {
          onFailedAttempt: () => {
            counter += 1;
          },
          onFailedLastAttempt: () => {
            counter += 2;
          },
        }
      );
    })
  ).toBe(true);
  var endTime = performance.now();

  expect(counter).toBe(4);
  expect(endTime - startTime).toBeGreaterThanOrEqual(2990);
  expect(endTime - startTime).toBeLessThanOrEqual(3010);
});
