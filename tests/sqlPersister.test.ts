import {
  BlockRange,
  CometHttpClient,
  SQLPersister,
  createRetrier,
} from "../src";
import { TEST_ARCHIVE_HTTP_URL, TEST_HTTP_URL } from "./consts";

const retrier = createRetrier(
  {
    maxRetries: 13,
  },
  () => 500
);

async function testGetUnprocessedBlockRanges(
  unprocessedBlockRange: BlockRange[],
  expectedBlockRange: BlockRange[],
  httpClient: CometHttpClient,
  latestBlockBuffer = 0
) {
  const persister = new SQLPersister(
    async (query) => {
      if (query.includes("SELECT *")) {
        return unprocessedBlockRange;
      }
      return [];
    },
    "",
    httpClient,
    latestBlockBuffer
  );

  const blocks = await persister.getUnprocessedBlockRanges();
  expect(blocks).toEqual(expectedBlockRange);
}

test("getUnprocessedBlockRanges() empty range", async () => {
  const httpClient = await CometHttpClient.create(
    TEST_ARCHIVE_HTTP_URL,
    retrier
  );
  const { earliestBlockHeight, latestBlockHeight } =
    await httpClient.getBlockHeights();
  await testGetUnprocessedBlockRanges(
    [],
    [
      {
        startBlockHeight: earliestBlockHeight,
        endBlockHeight: latestBlockHeight,
      },
    ],
    httpClient
  );
});

test("getUnprocessedBlockRanges() partial contiguous range", async () => {
  const httpClient = await CometHttpClient.create(
    TEST_ARCHIVE_HTTP_URL,
    retrier
  );
  const { latestBlockHeight } = await httpClient.getBlockHeights();
  await testGetUnprocessedBlockRanges(
    [
      { startBlockHeight: 1, endBlockHeight: 2 },
      { startBlockHeight: 3, endBlockHeight: 4 },
      { startBlockHeight: 5, endBlockHeight: 100 },
      { startBlockHeight: 101, endBlockHeight: 101 },
      { startBlockHeight: 102, endBlockHeight: 102 },
      { startBlockHeight: 103, endBlockHeight: 106 },
    ],
    [
      {
        startBlockHeight: 107,
        endBlockHeight: latestBlockHeight,
      },
    ],
    httpClient
  );
});

test("getUnprocessedBlockRanges() partial mixed range", async () => {
  const httpClient = await CometHttpClient.create(
    TEST_ARCHIVE_HTTP_URL,
    retrier
  );
  const { latestBlockHeight } = await httpClient.getBlockHeights();
  await testGetUnprocessedBlockRanges(
    [
      { startBlockHeight: 1, endBlockHeight: 2 },
      { startBlockHeight: 3, endBlockHeight: 4 },
      { startBlockHeight: 7, endBlockHeight: 100 },
      { startBlockHeight: 101, endBlockHeight: 101 },
      { startBlockHeight: 105, endBlockHeight: latestBlockHeight - 4 },
      {
        startBlockHeight: latestBlockHeight,
        endBlockHeight: latestBlockHeight,
      },
      {
        startBlockHeight: latestBlockHeight + 1,
        endBlockHeight: latestBlockHeight + 5,
      },
    ],
    [
      {
        startBlockHeight: 5,
        endBlockHeight: 6,
      },
      {
        startBlockHeight: 102,
        endBlockHeight: 104,
      },
      {
        startBlockHeight: latestBlockHeight - 3,
        endBlockHeight: latestBlockHeight - 1,
      },
    ],
    httpClient
  );
});

test("getUnprocessedBlockRanges() partial-overlap with smaller range", async () => {
  const httpClient = await CometHttpClient.create(TEST_HTTP_URL, retrier);
  const { earliestBlockHeight, latestBlockHeight } =
    await httpClient.getBlockHeights();
  await testGetUnprocessedBlockRanges(
    [
      {
        startBlockHeight: 1,
        endBlockHeight: 100,
      },
      {
        startBlockHeight: earliestBlockHeight - 5,
        endBlockHeight: earliestBlockHeight + 5,
      },
      {
        startBlockHeight: earliestBlockHeight + 10,
        endBlockHeight: earliestBlockHeight + 11,
      },
    ],
    [
      {
        startBlockHeight: earliestBlockHeight + 6,
        endBlockHeight: earliestBlockHeight + 9,
      },
      {
        startBlockHeight: earliestBlockHeight + 12,
        endBlockHeight: latestBlockHeight,
      },
    ],
    httpClient
  );
});

test("getUnprocessedBlockRanges() no overlap with smaller range", async () => {
  const httpClient = await CometHttpClient.create(TEST_HTTP_URL, retrier);
  const latestBlockBuffer = 2;
  const { earliestBlockHeight, latestBlockHeight } =
    await httpClient.getBlockHeights();
  await testGetUnprocessedBlockRanges(
    [
      {
        startBlockHeight: 1,
        endBlockHeight: 100,
      },
      {
        startBlockHeight: earliestBlockHeight - 5,
        endBlockHeight: earliestBlockHeight - 4,
      },
      {
        startBlockHeight: earliestBlockHeight - 3,
        endBlockHeight: earliestBlockHeight - 3,
      },
    ],
    [
      {
        startBlockHeight: earliestBlockHeight,
        endBlockHeight: latestBlockHeight - latestBlockBuffer,
      },
    ],
    httpClient,
    latestBlockBuffer
  );
});

test("getUnprocessedBlockRanges() partial-overlap with larger range", async () => {
  const httpClient = await CometHttpClient.create(
    TEST_ARCHIVE_HTTP_URL,
    retrier
  );
  const latestBlockBuffer = 2;
  const { earliestBlockHeight, latestBlockHeight } =
    await httpClient.getBlockHeights();
  await testGetUnprocessedBlockRanges(
    [
      {
        startBlockHeight: latestBlockHeight,
        endBlockHeight: latestBlockHeight,
      },
      {
        startBlockHeight: latestBlockHeight + 1,
        endBlockHeight: latestBlockHeight + 5,
      },
    ],
    [
      {
        startBlockHeight: earliestBlockHeight,
        endBlockHeight: latestBlockHeight - latestBlockBuffer,
      },
    ],
    httpClient,
    latestBlockBuffer
  );
});

test("getUnprocessedBlockRanges() no overlap with larger range", async () => {
  const httpClient = await CometHttpClient.create(
    TEST_ARCHIVE_HTTP_URL,
    retrier
  );
  const { earliestBlockHeight, latestBlockHeight } =
    await httpClient.getBlockHeights();
  await testGetUnprocessedBlockRanges(
    [
      {
        startBlockHeight: latestBlockHeight + 1,
        endBlockHeight: latestBlockHeight + 500,
      },
    ],
    [
      {
        startBlockHeight: earliestBlockHeight,
        endBlockHeight: latestBlockHeight,
      },
    ],
    httpClient
  );
});
