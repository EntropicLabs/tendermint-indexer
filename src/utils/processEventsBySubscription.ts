import type { NewBlockEvent } from "../types/Events";
import { IndexerDataType } from "../types/Indexer";
import { matchesEventFilter } from "./eventFilter";
import type { BlockData } from "../types/BlockData";
import type { Indexer } from "../modules/indexer";

/**
 * Passes events from a specific block to relevant indexers
 * based on their subscription parameters.
 */
export default async function processEventsBySubscription({
  newBlockEvent,
  indexers,
  shouldPersist = true,
}: {
  newBlockEvent: NewBlockEvent & BlockData;
  indexers: Indexer[];
  shouldPersist?: boolean;
}) {
  // Process in strict order of indexers and their subscriptions
  for (const indexer of indexers) {
    for (const subscription of indexer.subscriptions()) {
      switch (subscription.type) {
        case IndexerDataType.BLOCK:
          await subscription.indexer({
            block: newBlockEvent.block,
            blockResults: newBlockEvent.blockResults,
            blockHeight: newBlockEvent.blockHeight,
          });
          continue;
        case IndexerDataType.TX:
          await subscription.indexer({
            tx: newBlockEvent.tx,
            blockHeight: newBlockEvent.blockHeight,
          });
          continue;
        case IndexerDataType.EVENT:
          for (const event of newBlockEvent.events) {
            if (
              !subscription.filter ||
              matchesEventFilter(event, subscription.filter)
            ) {
              await subscription.indexer({
                blockHeight: newBlockEvent.blockHeight,
                eventAttributes: event.attributes,
                eventType: event.type,
              });
            }
          }
      }
    }
    if (shouldPersist) {
      await indexer.persister.persistBlock(newBlockEvent.blockHeight);
    }
  }
}
