/**
 * Postgres persister is tested by testing the underlying merge and get unprocessed block range logic.
 *
 * TODO: figure out how to create a Drizzle mock instance to directly test the postgres persister logic.
 */

import { CometHttpClient } from "../src/clients";
import { TEST_ARCHIVE_HTTP_URL, TEST_HTTP_URL } from "./consts";
import { DEFAULT_RETRIER } from "../src/modules/retry";
import getMissingRanges from "../src/utils/getMissingRanges";
import { BlockRange } from "../src";
import mergeRanges from "../src/utils/mergeRanges";
import { PGBlockRange } from "../src/types/BlockRange";

const archiveHttpClient = await CometHttpClient.create(
  TEST_ARCHIVE_HTTP_URL,
  DEFAULT_RETRIER
);

const httpClient = await CometHttpClient.create(TEST_HTTP_URL, DEFAULT_RETRIER);

const {
  earliestBlockHeight: archiveEarliestBlockHeight,
  latestBlockHeight: archiveLatestBlockHeight,
} = await archiveHttpClient.getBlockHeights();

const { earliestBlockHeight, latestBlockHeight } =
  await httpClient.getBlockHeights();

function testGetMissingRanges(
  minBlockHeight: number,
  maxBlockHeight: number,
  ranges: BlockRange[],
  expectedRange: BlockRange[]
) {
  const actualRange = getMissingRanges(minBlockHeight, maxBlockHeight, ranges);
  expect(actualRange).toEqual(expectedRange);
}

function testMergeRanges(
  ranges: PGBlockRange[],
  expectedRangesToUpdate: PGBlockRange[],
  expectedRangesToDelete: number[]
) {
  const { rangesToDelete, rangesToUpdate } = mergeRanges(ranges);
  expect(expectedRangesToUpdate).toEqual(rangesToUpdate);
  expect(expectedRangesToDelete).toEqual(rangesToDelete);
}

test("getMissingRanges() empty range", async () => {
  testGetMissingRanges(
    archiveEarliestBlockHeight,
    archiveLatestBlockHeight,
    [],
    [
      {
        startBlockHeight: archiveEarliestBlockHeight,
        endBlockHeight: archiveLatestBlockHeight,
      },
    ]
  );
});

test("getMissingRanges() partial contiguous range", async () => {
  testGetMissingRanges(
    archiveEarliestBlockHeight,
    archiveLatestBlockHeight,
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
        endBlockHeight: archiveLatestBlockHeight,
      },
    ]
  );
});

test("getMissingRanges() partial mixed range", async () => {
  testGetMissingRanges(
    archiveEarliestBlockHeight,
    archiveLatestBlockHeight,
    [
      { startBlockHeight: 1, endBlockHeight: 2 },
      { startBlockHeight: 3, endBlockHeight: 4 },
      { startBlockHeight: 7, endBlockHeight: 100 },
      { startBlockHeight: 101, endBlockHeight: 101 },
      { startBlockHeight: 105, endBlockHeight: archiveLatestBlockHeight - 4 },
      {
        startBlockHeight: archiveLatestBlockHeight,
        endBlockHeight: archiveLatestBlockHeight,
      },
      {
        startBlockHeight: archiveLatestBlockHeight + 1,
        endBlockHeight: archiveLatestBlockHeight + 5,
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
        startBlockHeight: archiveLatestBlockHeight - 3,
        endBlockHeight: archiveLatestBlockHeight - 1,
      },
    ]
  );
});

test("getMissingRanges() partial-overlap with smaller range", async () => {
  testGetMissingRanges(
    earliestBlockHeight,
    latestBlockHeight,
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
    ]
  );
});

test("getMissingRanges() no overlap with smaller range", async () => {
  testGetMissingRanges(
    earliestBlockHeight,
    latestBlockHeight,
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
        endBlockHeight: latestBlockHeight,
      },
    ]
  );
});

test("getMissingRanges() partial-overlap with larger range", async () => {
  testGetMissingRanges(
    earliestBlockHeight,
    latestBlockHeight,
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
        endBlockHeight: latestBlockHeight - 1,
      },
    ]
  );
});

test("getMissingRanges() no overlap with larger range", async () => {
  testGetMissingRanges(
    archiveEarliestBlockHeight,
    archiveLatestBlockHeight,
    [
      {
        startBlockHeight: archiveLatestBlockHeight + 1,
        endBlockHeight: archiveLatestBlockHeight + 500,
      },
    ],
    [
      {
        startBlockHeight: archiveEarliestBlockHeight,
        endBlockHeight: archiveLatestBlockHeight,
      },
    ]
  );
});

test("getMissingRanges() no overlap with one block difference", async () => {
  testGetMissingRanges(
    archiveEarliestBlockHeight,
    archiveLatestBlockHeight,
    [
      {
        startBlockHeight: 1,
        endBlockHeight: 20,
      },
      {
        startBlockHeight: 22,
        endBlockHeight: 24,
      },
      {
        startBlockHeight: 26,
        endBlockHeight: 30,
      },
    ],
    [
      {
        startBlockHeight: 21,
        endBlockHeight: 21,
      },
      {
        startBlockHeight: 25,
        endBlockHeight: 25,
      },
      {
        startBlockHeight: 31,
        endBlockHeight: archiveLatestBlockHeight,
      },
    ]
  );
});

test("mergeRanges() empty", async () => {
  testMergeRanges([], [], []);
});

test("mergeRanges() no overlap", async () => {
  testMergeRanges(
    [
      { startBlockHeight: 1, endBlockHeight: 2, id: 1 },
      { startBlockHeight: 4, endBlockHeight: 5, id: 2 },
      { startBlockHeight: 7, endBlockHeight: 100, id: 100 },
    ],
    [
      { startBlockHeight: 1, endBlockHeight: 2, id: 1 },
      { startBlockHeight: 4, endBlockHeight: 5, id: 2 },
      { startBlockHeight: 7, endBlockHeight: 100, id: 100 },
    ],
    []
  );
});

test("mergeRanges() contiguous overlap", async () => {
  testMergeRanges(
    [
      { startBlockHeight: 1, endBlockHeight: 2, id: 1 },
      { startBlockHeight: 3, endBlockHeight: 4, id: 2 },
      { startBlockHeight: 5, endBlockHeight: 6, id: 100 },
    ],
    [{ startBlockHeight: 1, endBlockHeight: 6, id: 1 }],
    [2, 100]
  );
});

test("mergeRanges() complete overlap", async () => {
  testMergeRanges(
    [
      { startBlockHeight: 1, endBlockHeight: 5, id: 1 },
      { startBlockHeight: 3, endBlockHeight: 4, id: 2 },
      { startBlockHeight: 6, endBlockHeight: 7, id: 100 },
    ],
    [{ startBlockHeight: 1, endBlockHeight: 7, id: 1 }],
    [2, 100]
  );
});

test("mergeRanges() partial complete overlap", async () => {
  testMergeRanges(
    [
      { startBlockHeight: 1, endBlockHeight: 5, id: 1 },
      { startBlockHeight: 3, endBlockHeight: 4, id: 2 },
      { startBlockHeight: 8, endBlockHeight: 100, id: 100 },
    ],
    [
      { startBlockHeight: 1, endBlockHeight: 5, id: 1 },
      { startBlockHeight: 8, endBlockHeight: 100, id: 100 },
    ],
    [2]
  );
});

test("mergeRanges() pair overlap", async () => {
  testMergeRanges(
    [
      { startBlockHeight: 1, endBlockHeight: 5, id: 1 },
      { startBlockHeight: 6, endBlockHeight: 400, id: 2 },
      { startBlockHeight: 500, endBlockHeight: 2000, id: 3 },
      { startBlockHeight: 2003, endBlockHeight: 2004, id: 4 },
      { startBlockHeight: 2005, endBlockHeight: 2006, id: 5 },
      { startBlockHeight: 20000, endBlockHeight: 30000, id: 6 },
      { startBlockHeight: 30001, endBlockHeight: 300000, id: 7 },
    ],
    [
      { startBlockHeight: 1, endBlockHeight: 400, id: 1 },
      { startBlockHeight: 500, endBlockHeight: 2000, id: 3 },
      { startBlockHeight: 2003, endBlockHeight: 2006, id: 4 },
      { startBlockHeight: 20000, endBlockHeight: 300000, id: 6 },
    ],
    [2, 5, 7]
  );
});
