import {
  type ConnectionEvent,
  isConnectionEvent,
  type NewBlockEvent,
} from "./types/Events";
import type { CreateIndexerFunction } from "./types/CreateIndexerFunction";
import { createSubscriptionClient } from "./utils/createSubscriptionClient";
import type { AddEventFunction } from "./types/AddEventFunction";
import processEventsBySubscription from "./utils/processEventsBySubscription";
import logger, { setMinLogLevel } from "./modules/logger";
import { CometHttpClient } from "./clients/cometHttpClient";
import { sleep } from "./utils/sleep";

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
}: CreateIndexerFunction) {
  setMinLogLevel(minLogLevel);
  let prevBlockHeight = 0;
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
    harness.retrier,
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
          `Block ${tmEvent.blockHeight} is queued after block ${prevBlockHeight}`,
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

    setTimeout(async () => {
      await processTmEventQueue();
    }, PROCESS_QUEUE_EVERY_MS);
  }

  async function start() {
    await subscriptionClient.listen();
    processTmEventQueue();
  }

  async function destroy(delay = DESTROY_DELAY_MS) {
    // Prevent new blocks from being pushed to the event queue
    await subscriptionClient.disconnect();

    // Give some time for the queue to finish up
    await sleep(delay);
    tmEventQueue.splice(0, tmEventQueue.length);

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
