import { CometHttpClient } from "./clients";
import { BackfillOrder } from "./types/BackfillOrder";
import type { CreateBackfillerParams } from "./types/CreateBackfillerParams";
import backfillBlockRange from "./utils/backfillBlockRange";
import { splitRangeEvenly } from "./utils/splitRange";
import { backfillBlock } from "./utils/backfillBlock";
import logger, { setMinLogLevel } from "./modules/logger";
import { DEFAULT_RETRIER } from './modules/retry';

// Minimum number of blocks that be processed by a single process when concurrently backfilling
const MIN_BLOCKS_PER_RANGE = 100;

/**
 * Create an backfiller for indexing historical block data.
 * Returns a start and destroy callback.
 */
export default async function createBackfiller({
  harness,
  backfillSetup,
  minLogLevel = "trace",
}: CreateBackfillerParams) {
  setMinLogLevel(minLogLevel);

  const httpClient = await CometHttpClient.create(
    harness.httpUrl,
    harness.retrier || DEFAULT_RETRIER
  );

  async function start() {
    logger.info("Starting backfill...");

    const { backfillOrder } = backfillSetup;

    // Process each range based on the order
    switch (backfillOrder) {
      case BackfillOrder.ASCENDING:
      case BackfillOrder.DESCENDING:

        // Process blocks not seen by the backfiller
        let unprocessedBlockRanges =
          await harness.indexer.persister.getUnprocessedBlockRanges();

        const sortNum = backfillOrder === BackfillOrder.ASCENDING ? 1 : -1;

        unprocessedBlockRanges.sort(
          (a, b) => sortNum * (a.startBlockHeight - b.startBlockHeight)
        );

        if (unprocessedBlockRanges.length > 0) {
          logger.info("Backfilling the following ranges:");
          logger.info(unprocessedBlockRanges);
        }

        for (const {
          startBlockHeight,
          endBlockHeight,
        } of unprocessedBlockRanges) {
          await backfillBlockRange({
            backfillOrder,
            harness,
            httpClient,
            maxBlockHeight: endBlockHeight,
            minBlockHeight: startBlockHeight,
          });
        }
        break;
      case BackfillOrder.CONCURRENT:
        // Process blocks not seen by the backfiller
        const unprocessedConcurrentBlockRanges =
          await harness.indexer.persister.getUnprocessedBlockRanges();

        const { numProcesses } = backfillSetup;

        for (const blockRange of unprocessedConcurrentBlockRanges) {
          // Split block into even chunks for each thread
          const evenUnprocessedBlockRanges = splitRangeEvenly({
            blockRange,
            numSplit: numProcesses,
            minBlocksPerRange: MIN_BLOCKS_PER_RANGE,
          });

          // TODO: Replace Promise.all with multithreading
          await Promise.all(
            evenUnprocessedBlockRanges.map(
              ({ startBlockHeight, endBlockHeight }) =>
                backfillBlockRange({
                  backfillOrder: BackfillOrder.ASCENDING,
                  harness,
                  httpClient,
                  maxBlockHeight: endBlockHeight,
                  minBlockHeight: startBlockHeight,
                })
            )
          );
        }
        break;
      case BackfillOrder.SPECIFIC:
        const { blockHeightsToProcess, shouldPersist } = backfillSetup;

        for (const blockHeight of blockHeightsToProcess) {
          await backfillBlock({
            blockHeight,
            harness,
            httpClient,
            shouldPersist,
          });
        }
        break;
      default:
        logger.error(`${backfillOrder} is never`);
    }
    logger.info("Done with backfill!");
  }

  async function destroy() {
    // Clean up all indexer
    await harness.indexer.destroy();
  }

  return { start, destroy };
}
