import { CometHttpClient } from "./clients";
import { BackfillOrder } from "./types/BackfillOrder";
import type { CreateBackfillerFunction } from "./types/CreateBackfillerFunction";
import backfillBlockRange from "./utils/backfillBlockRange";
import { splitRangeEvenly, splitRangesBySize } from "./utils/splitRange";
import { backfillBlock } from "./utils/backfillBlock";
import logger, { setMinLogLevel } from "./modules/logger";

const MIN_BLOCKS_PER_THREAD = 100;
const MAX_BLOCKS = 200;

export default async function createBackfiller({
  harness,
  backfillSetup,
  minLogLevel = "trace",
}: CreateBackfillerFunction) {
  setMinLogLevel(minLogLevel);

  const httpClient = await CometHttpClient.create(
    harness.httpUrl,
    harness.retrier
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
      case BackfillOrder.PARALLEL:
        // Process blocks not seen by the backfiller
        unprocessedBlockRanges =
          await harness.indexer.persister.getUnprocessedBlockRanges();

        // Split ranges into smaller, more manegeable chunks to reduce fragementation
        const smallerBlockRanges = splitRangesBySize({
          blockRanges: unprocessedBlockRanges,
          size: MAX_BLOCKS,
        });

        const { numThreads } = backfillSetup;

        for (const blockRange of smallerBlockRanges) {
          // Split block into even chunks for each thread
          const evenUnprocessedBlockRanges = splitRangeEvenly({
            blockRange,
            numSplit: numThreads,
            minBlocksPerRange: MIN_BLOCKS_PER_THREAD,
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
