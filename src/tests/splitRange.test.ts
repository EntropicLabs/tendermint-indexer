import { splitRangesEvenly, splitRangesBySize } from "../utils/splitRange";

test("Single split", () => {
  const range = [
    { startBlockHeight: 4, endBlockHeight: 21 },
    { startBlockHeight: 25, endBlockHeight: 30 },
    { startBlockHeight: 31, endBlockHeight: 32 },
  ];
  const ans = splitRangesEvenly({
    minBlocksPerRange: 1,
    numSplit: 1,
    blockRanges: range,
  });

  expect(ans).toEqual([
    { startBlockHeight: 4, endBlockHeight: 21 },
    { startBlockHeight: 25, endBlockHeight: 30 },
    { startBlockHeight: 31, endBlockHeight: 32 },
  ]);
});

test("Multiple even split", () => {
  const range = [{ startBlockHeight: 1, endBlockHeight: 10 }];
  const ans = splitRangesEvenly({
    minBlocksPerRange: 1,
    numSplit: 5,
    blockRanges: range,
  });

  expect(ans).toEqual([
    { startBlockHeight: 1, endBlockHeight: 2 },
    { startBlockHeight: 3, endBlockHeight: 4 },
    { startBlockHeight: 5, endBlockHeight: 6 },
    { startBlockHeight: 7, endBlockHeight: 8 },
    { startBlockHeight: 9, endBlockHeight: 10 },
  ]);
});

test("Multiple non even split", () => {
  const range = [{ startBlockHeight: 1, endBlockHeight: 9 }];
  const ans = splitRangesEvenly({
    minBlocksPerRange: 1,
    numSplit: 5,
    blockRanges: range,
  });

  expect(ans).toEqual([
    { startBlockHeight: 1, endBlockHeight: 2 },
    { startBlockHeight: 3, endBlockHeight: 4 },
    { startBlockHeight: 5, endBlockHeight: 6 },
    { startBlockHeight: 7, endBlockHeight: 8 },
    { startBlockHeight: 9, endBlockHeight: 9 },
  ]);
});

test("Complicated split", () => {
  const range = [
    { startBlockHeight: 4, endBlockHeight: 21 },
    { startBlockHeight: 25, endBlockHeight: 30 },
    { startBlockHeight: 31, endBlockHeight: 32 },
  ];
  const ans = splitRangesEvenly({
    minBlocksPerRange: 1,
    numSplit: 2,
    blockRanges: range,
  });

  expect(ans).toEqual([
    { startBlockHeight: 4, endBlockHeight: 12 },
    { startBlockHeight: 13, endBlockHeight: 21 },
    { startBlockHeight: 25, endBlockHeight: 27 },
    { startBlockHeight: 28, endBlockHeight: 30 },
    { startBlockHeight: 31, endBlockHeight: 31 },
    { startBlockHeight: 32, endBlockHeight: 32 },
  ]);
});

test("No split", () => {
  const range = [
    { startBlockHeight: 1, endBlockHeight: 3 },
    { startBlockHeight: 4, endBlockHeight: 6 },
    { startBlockHeight: 7, endBlockHeight: 12 },
  ];
  const ans = splitRangesEvenly({
    minBlocksPerRange: 6,
    numSplit: 2,
    blockRanges: range,
  });

  expect(ans).toEqual(range);
});

test("Split of size 1", () => {
  const range = [{ startBlockHeight: 1, endBlockHeight: 5 }];
  const ans = splitRangesBySize({
    size: 1,
    blockRanges: range,
  });

  expect(ans).toEqual([
    { startBlockHeight: 1, endBlockHeight: 1 },
    { startBlockHeight: 2, endBlockHeight: 2 },
    { startBlockHeight: 3, endBlockHeight: 3 },
    { startBlockHeight: 4, endBlockHeight: 4 },
    { startBlockHeight: 5, endBlockHeight: 5 },
  ]);
});

test("Split of size 2", () => {
  const range = [{ startBlockHeight: 1, endBlockHeight: 6 }];
  const ans = splitRangesBySize({
    size: 2,
    blockRanges: range,
  });

  expect(ans).toEqual([
    { startBlockHeight: 1, endBlockHeight: 2 },
    { startBlockHeight: 3, endBlockHeight: 4 },
    { startBlockHeight: 5, endBlockHeight: 6 },
  ]);
});

test("Uneven Split of size 2", () => {
  const range = [{ startBlockHeight: 1, endBlockHeight: 7 }];
  const ans = splitRangesBySize({
    size: 3,
    blockRanges: range,
  });

  expect(ans).toEqual([
    { startBlockHeight: 1, endBlockHeight: 3 },
    { startBlockHeight: 4, endBlockHeight: 6 },
    { startBlockHeight: 7, endBlockHeight: 7 },
  ]);
});

test("No Split of size 100", () => {
  const range = [{ startBlockHeight: 1, endBlockHeight: 7 }];
  const ans = splitRangesBySize({
    size: 100,
    blockRanges: range,
  });

  expect(ans).toEqual([{ startBlockHeight: 1, endBlockHeight: 7 }]);
});
