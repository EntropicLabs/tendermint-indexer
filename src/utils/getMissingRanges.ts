import { BlockRange } from "../types/BlockRange";

/**
 * Determines inclusive ranges of blocks missing in between a minimum and maximum block height
 * @param minBlockHeight Inclusive minimum
 * @param maxBlockHeight Inclusive maximum
 * @param blockRanges Inclusive block ranges representing blocks that are not missing
 * @returns The missing, inclusive block ranges
 */
export default function getMissingRanges(
  minBlockHeight: number,
  maxBlockHeight: number,
  blockRanges: BlockRange[]
) {
  // Remove all block ranges that are outside the earliest and latest block height saved by the HTTP RPC node
  const boundedBlockRanges = blockRanges
    .map(({ startBlockHeight, endBlockHeight }) => {
      if (
        endBlockHeight < minBlockHeight ||
        startBlockHeight > maxBlockHeight
      ) {
        return null;
      }
      return {
        startBlockHeight: Math.max(minBlockHeight, startBlockHeight),
        endBlockHeight: Math.min(maxBlockHeight, endBlockHeight),
      };
    })
    .filter((range) => range != null);

  const initialMinBlockHeight = minBlockHeight;
  const initialMaxBlockHeight = maxBlockHeight;

  const unprocessedBlockRanges: BlockRange[] = [];
  for (const { startBlockHeight, endBlockHeight } of boundedBlockRanges) {
    if (
      !(
        initialMinBlockHeight <= startBlockHeight &&
        startBlockHeight <= initialMaxBlockHeight &&
        initialMinBlockHeight <= endBlockHeight &&
        endBlockHeight <= initialMaxBlockHeight
      )
    ) {
      throw new Error(
        `Block ranges ${startBlockHeight}, ${endBlockHeight} outside of range ${initialMinBlockHeight}, ${initialMaxBlockHeight}`
      );
    }
    // Current and previous block range are contigous
    if (startBlockHeight == minBlockHeight) {
      minBlockHeight = endBlockHeight + 1;
      continue;
    }
    unprocessedBlockRanges.push({
      startBlockHeight: minBlockHeight,
      endBlockHeight: startBlockHeight - 1,
    });
    minBlockHeight = endBlockHeight + 1;
  }
  if (minBlockHeight <= maxBlockHeight) {
    unprocessedBlockRanges.push({
      startBlockHeight: minBlockHeight,
      endBlockHeight: maxBlockHeight,
    });
  }
  return unprocessedBlockRanges;
}
