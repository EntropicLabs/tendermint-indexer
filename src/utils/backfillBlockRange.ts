import { BackfillOrder } from "../types/BackfillOrder";
import type { CometHttpClient } from "../clients";
import { backfillBlock } from "./backfillBlock";
import type { BackfillHarness } from "../types/Harness";
import logger from "../modules/logger";

const LOG_PER_BLOCKS = 10000;

/**
 * Gets all of events for blocks within an inclusive range of heights
 * and passes it to relevant indexers.
 * @param backfillOrder Backfill order
 * @param harness Harness containing indexers and their subscriptions
 * @param httpClient HTTP client used to query block data
 * @param maxBlockHeight Minimum block height of range
 * @param minBlockHeight Maximum block height of range
 */
export default async function backfillBlockRange({
  backfillOrder,
  harness,
  httpClient,
  maxBlockHeight,
  minBlockHeight,
}: {
  backfillOrder:
    | typeof BackfillOrder.ASCENDING
    | typeof BackfillOrder.DESCENDING;
  harness: BackfillHarness;
  httpClient: CometHttpClient;
  maxBlockHeight: number;
  minBlockHeight: number;
}) {
  const isAscending = backfillOrder === BackfillOrder.ASCENDING;
  const startBlockHeight = isAscending ? minBlockHeight : maxBlockHeight;
  const endBlockHeight = isAscending ? maxBlockHeight : minBlockHeight;

  const areBlocksLeft = isAscending
    ? (a: number, b: number) => a <= b
    : (a: number, b: number) => a >= b;

  let blockHeight = startBlockHeight;
  try {
    while (areBlocksLeft(blockHeight, endBlockHeight)) {
      // Process blocks one by one
      await backfillBlock({
        httpClient,
        blockHeight,
        harness,
      });

      if (blockHeight % LOG_PER_BLOCKS === 0 && !isAscending) {
        logger.info(
          `Processed blocks ${blockHeight} - ${Math.min(
            blockHeight + (LOG_PER_BLOCKS - 1),
            maxBlockHeight
          )}`
        );
      }

      if (blockHeight % LOG_PER_BLOCKS === LOG_PER_BLOCKS - 1 && isAscending) {
        logger.info(
          `Processed blocks with heights ${Math.max(
            minBlockHeight,
            blockHeight - (LOG_PER_BLOCKS - 1)
          )} - ${blockHeight}`
        );
      }

      blockHeight += isAscending ? 1 : -1;
    }
  } catch (error) {
    logger.error(`Error in backfill: ${error}`);
  } finally {
    const range = isAscending
      ? `${minBlockHeight} to ${blockHeight - 1}`
      : `${blockHeight + 1} to ${maxBlockHeight}`;

    logger.info(`Finished backfilling unstake events from blocks ${range}`);
  }
}
