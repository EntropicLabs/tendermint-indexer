import { CometHttpClient } from "../clients/cometHttpClient";
import type { BackfillHarness } from "../types/Harness";
import processEventsBySubscription from "./processEventsBySubscription";

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
