import { splitRangeEvenly } from "../src/utils/splitRange";

test("Single split", () => {
  const range = { startBlockHeight: 4, endBlockHeight: 21 };
  const ans = splitRangeEvenly({
    numSplit: 1,
    blockRange: range,
  });

  expect(ans).toEqual([{ startBlockHeight: 4, endBlockHeight: 21 }]);
});

test("Multiple even split", () => {
  const range = { startBlockHeight: 1, endBlockHeight: 10 };
  const ans = splitRangeEvenly({
    numSplit: 5,
    blockRange: range,
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
  const range = { startBlockHeight: 1, endBlockHeight: 9 };
  const ans = splitRangeEvenly({
    numSplit: 5,
    blockRange: range,
  });

  expect(ans).toEqual([
    { startBlockHeight: 1, endBlockHeight: 2 },
    { startBlockHeight: 3, endBlockHeight: 4 },
    { startBlockHeight: 5, endBlockHeight: 6 },
    { startBlockHeight: 7, endBlockHeight: 8 },
    { startBlockHeight: 9, endBlockHeight: 9 },
  ]);
});

test("Larger multiple non even split", () => {
  const range = { startBlockHeight: 1, endBlockHeight: 12 };
  const ans = splitRangeEvenly({
    numSplit: 5,
    blockRange: range,
  });

  expect(ans).toEqual([
    { startBlockHeight: 1, endBlockHeight: 3 },
    { startBlockHeight: 4, endBlockHeight: 6 },
    { startBlockHeight: 7, endBlockHeight: 8 },
    { startBlockHeight: 9, endBlockHeight: 10 },
    { startBlockHeight: 11, endBlockHeight: 12 },
  ]);
});

test("Complicated split", () => {
  const range = { startBlockHeight: 4, endBlockHeight: 21 };

  const ans = splitRangeEvenly({
    numSplit: 2,
    blockRange: range,
  });

  expect(ans).toEqual([
    { startBlockHeight: 4, endBlockHeight: 12 },
    { startBlockHeight: 13, endBlockHeight: 21 },
  ]);
});

test("No split", () => {
  const range = { startBlockHeight: 1, endBlockHeight: 3 };

  const ans = splitRangeEvenly({
    numSplit: 10,
    blockRange: range,
  });

  expect(ans).toEqual([range]);
});
