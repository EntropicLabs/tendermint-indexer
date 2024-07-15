import { CometHttpClient } from "../src/clients/cometHttpClient";
import { createRetrier } from "../src/modules/retry";
import { TEST_ARCHIVE_HTTP_URL } from "./consts";
import { checkErrorThrow } from "./utils";

const retrier = createRetrier(
  {
    maxRetries: 1,
  },
  () => 500
);

test("Fail in initialization due to bad HTTP URL", async () => {
  expect(
    await checkErrorThrow(async () => {
      await CometHttpClient.create("badurl", retrier);
    })
  ).toBe(true);
});

test("Succeed in getting block data", async () => {
  expect(
    await checkErrorThrow(async () => {
      const httpClient = await CometHttpClient.create(
        TEST_ARCHIVE_HTTP_URL,
        retrier
      );
      const data = await httpClient.getBlockData(16253511);
      expect(data.blockResults.height).toBe(16253511);
      expect(data.events.length).toBeGreaterThan(0);
    })
  ).toBe(false);
});

test("Fail to get negative block height data", async () => {
  expect(
    await checkErrorThrow(async () => {
      const httpClient = await CometHttpClient.create(
        TEST_ARCHIVE_HTTP_URL,
        retrier
      );
      await httpClient.getBlockData(-1);
    })
  ).toBe(true);
});

test("Succeed in getting block time", async () => {
  expect(
    await checkErrorThrow(async () => {
      const httpClient = await CometHttpClient.create(
        TEST_ARCHIVE_HTTP_URL,
        retrier
      );
      const blockTime = await httpClient.getBlockTime(1);
      expect(blockTime.getTime()).toBe(
        new Date("2022-07-01T12:00:00.000Z").getTime()
      );
    })
  ).toBe(false);
});

test("Fail to get out of bounds block time", async () => {
  expect(
    await checkErrorThrow(async () => {
      const httpClient = await CometHttpClient.create(
        TEST_ARCHIVE_HTTP_URL,
        retrier
      );
      await httpClient.getBlockTime(10000000000);
    })
  ).toBe(true);
});

test("Succeed in getting block heights", async () => {
  expect(
    await checkErrorThrow(async () => {
      const httpClient = await CometHttpClient.create(
        TEST_ARCHIVE_HTTP_URL,
        retrier
      );
      const { earliestBlockHeight, latestBlockHeight } =
        await httpClient.getBlockHeights();
      expect(earliestBlockHeight).toBe(1);
      expect(latestBlockHeight).toBeGreaterThan(1);
    })
  ).toBe(false);
});

test("Fail to get bad HTTP URL block heights", async () => {
  expect(
    await checkErrorThrow(async () => {
      const httpClient = await CometHttpClient.create(
        "https://google.com",
        retrier
      );
      await httpClient.getBlockHeights();
    })
  ).toBe(true);
});
