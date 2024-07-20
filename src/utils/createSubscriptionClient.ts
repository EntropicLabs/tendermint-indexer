import { CometWsClient, CometHttpPollClient } from "../clients";
import { EndpointType } from "../types/EndpointType";
import type { IndexerHarness } from "../types/Harness";
import type { AddEventFunction } from "../types/AddEventFunction";
import { DEFAULT_RETRIER } from "../modules/retry";

/**
 * Creates and returns a WebSocket or HTTP Polling Subscription client
 */
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
        harness.retrier || DEFAULT_RETRIER,
        addEvent,
      );
      return wsClient;
    case EndpointType.HTTP_POLL:
      const httpClient = await CometHttpPollClient.create(
        harness.httpUrl,
        harness.retrier || DEFAULT_RETRIER,
        addEvent,
      );
      return httpClient;
  }
}
