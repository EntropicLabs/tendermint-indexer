import {
  type ConnectionEvent,
  isConnectionEvent,
  type NewBlockEvent,
} from "./types/Events";
import type { CreateIndexerParams } from "./types/CreateIndexerParams";
import { createSubscriptionClient } from "./utils/createSubscriptionClient";
import type { AddEventFunction } from "./types/AddEventFunction";
import processEventsBySubscription from "./utils/processEventsBySubscription";
import logger, { setMinLogLevel } from "./modules/logger";
import { CometHttpClient } from "./clients/cometHttpClient";
import { sleep } from "./utils/sleep";
import { DEFAULT_RETRIER } from "./modules/retry";

// Delay between each time the indexer queue is processed
const PROCESS_QUEUE_EVERY_MS = 100;
// Delay before the indexer and its subscriptions are destroyed
const DESTROY_DELAY_MS = 3000;

/**
 * Create an indexer for indexing live, new block data.
 * Returns a start, connection status, and destroy callback.
 */
export default async function createIndexer({
  harness,
  minLogLevel = "trace",
}: CreateIndexerParams) {
  setMinLogLevel(minLogLevel);
  let prevBlockHeight = 0;
  let isDestroyed = false;
  const tmEventQueue: (NewBlockEvent | ConnectionEvent)[] = [];

  const addEvent: AddEventFunction = (event) => {
    // Instead of processing each event right away, we'll add the event to a queue
    tmEventQueue.push(event);
  };

  const subscriptionClient = await createSubscriptionClient({
    harness,
    addEvent,
  });

  const httpClient = await CometHttpClient.create(
    harness.httpUrl,
    harness.retrier || DEFAULT_RETRIER
  );

  async function processTmEventQueue() {
    while (tmEventQueue.length > 0) {
      const tmEvent = tmEventQueue.shift();

      if (tmEvent === undefined) {
        logger.error("Empty event queue");
        continue;
      }

      if (isConnectionEvent(tmEvent)) {
        continue;
      }

      if (tmEvent.blockHeight < prevBlockHeight) {
        throw new Error(
          `Block ${tmEvent.blockHeight} is queued after block ${prevBlockHeight}`
        );
      }

      // Get block data from the RPC Node
      const blockData = await httpClient.getBlockData(tmEvent.blockHeight);

      await processEventsBySubscription({
        indexers: harness.indexers,
        newBlockEvent: {
          blockHeight: tmEvent.blockHeight,
          ...blockData,
        },
      });

      prevBlockHeight = tmEvent.blockHeight;
    }

    // Check if the indexer is destroyed before reprocessing the queue
    if (!isDestroyed) {
      setTimeout(async () => {
        await processTmEventQueue();
      }, PROCESS_QUEUE_EVERY_MS);
    }
  }

  async function start() {
    await subscriptionClient.listen();
    processTmEventQueue();
  }

  /**
   * Destroys the indexer. Can be called at any time.
   * @param delay Millisecond delay for indexers to finish up indexing.
   */
  async function destroy(delay = DESTROY_DELAY_MS) {
    // Prevent new blocks from being pushed to the event queue
    await subscriptionClient.disconnect();

    tmEventQueue.splice(0, tmEventQueue.length);
    isDestroyed = true;

    // Give some time for the indexers to finish up
    await sleep(delay);

    // Clean up all indexers
    await Promise.all(harness.indexers.map((indexer) => indexer.destroy()));
  }

  function isSubscriptionClientConnected() {
    return subscriptionClient.connected;
  }

  return {
    isSubscriptionClientConnected,
    start,
    destroy,
  };
}
