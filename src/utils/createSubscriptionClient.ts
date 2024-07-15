import { CometWsClient, CometHttpPollClient } from "../clients";
import { EndpointType } from "../types/EndpointType";
import type { IndexerHarness } from "../types/Harness";
import type { AddEventFunction } from "../types/AddEventFunction";

export async function createSubscriptionClient({
  harness,
  addEvent,
}: {
  harness: IndexerHarness;
  addEvent: AddEventFunction;
}) {
  switch (harness.type) {
    case EndpointType.WEBSOCKET:
      const wsClient = await CometWsClient.create(
        harness.wsUrl,
        harness.retrier,
        addEvent,
      );
      return wsClient;
    case EndpointType.HTTP_POLL:
      const httpClient = await CometHttpPollClient.create(
        harness.httpUrl,
        harness.retrier,
        addEvent,
      );
      return httpClient;
  }
}
