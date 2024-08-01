import type { BlockRange } from "../types/BlockRange";

/**
 * Splits a block range into a specific number of contiguous block ranges
 * with a minimum size
 */
export function splitRangeEvenly({
  minBlocksPerRange,
  numSplit,
  blockRange,
}: {
  minBlocksPerRange: number;
  numSplit: number;
  blockRange: BlockRange;
}): BlockRange[] {
  const evenblockRanges = [];
  const { startBlockHeight, endBlockHeight } = blockRange;

  const numBlocksInRange = endBlockHeight - startBlockHeight + 1;
  if (numBlocksInRange <= minBlocksPerRange || numBlocksInRange < numSplit) {
    return [
      {
        startBlockHeight,
        endBlockHeight,
      },
    ];
  }

  let prevEnd = startBlockHeight - 1;

  for (let idx = 0; idx < numSplit; idx++) {
    const numBlocks =
      Math.floor(numBlocksInRange / numSplit) +
      (idx < numBlocksInRange % numSplit ? 1 : 0);

    evenblockRanges.push({
      startBlockHeight: prevEnd + 1,
      endBlockHeight: prevEnd + numBlocks,
    });
    prevEnd = prevEnd + numBlocks;
  }

  return evenblockRanges;
}

/**
 * Splits block ranges into a specific number of contiguous block ranges
 * with a minimum size
 */
export function splitRangesEvenly({
  minBlocksPerRange,
  numSplit,
  blockRanges,
}: {
  minBlocksPerRange: number;
  numSplit: number;
  blockRanges: BlockRange[];
}) {
  return blockRanges.reduce(
    (prevRanges: BlockRange[], currRange) =>
      prevRanges.concat(
        splitRangeEvenly({
          blockRange: currRange,
          numSplit,
          minBlocksPerRange,
        })
      ),
    []
  );
}
