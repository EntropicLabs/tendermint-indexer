import { CometHttpClient } from "../clients/cometHttpClient";
import type { BackfillHarness } from "../types/Harness";
import processEventsBySubscription from "./processEventsBySubscription";

/**
 * Gets block data by height and passes it to relevant indexers
 * @param blockHeight Block height
 * @param harness Harness containing indexers and their subscriptions
 * @param httpClient HTTP client used to query block data
 * @param shouldPersist True if the persister should be notified
 */
export async function backfillBlock({
  blockHeight,
  harness,
  httpClient,
  shouldPersist = true,
}: {
  blockHeight: number;
  harness: BackfillHarness;
  httpClient: CometHttpClient;
  shouldPersist?: boolean;
}) {
  const blockData = await httpClient.getBlockData(blockHeight);

  const newBlockEvent = {
    blockHeight,
    ...blockData,
  };

  // Process each event by the harness's subscriptions
  await processEventsBySubscription({
    indexers: [harness.indexer],
    newBlockEvent,
    shouldPersist,
  });
}
