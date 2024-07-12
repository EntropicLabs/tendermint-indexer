import { CometWsClient, CometHttpPollClient } from "../clients";
import { EndpointType } from "../types/EndpointType";
import type { IndexerHarness } from "../types/Harness";
import type { ParseEventsFunction } from "../types/ParseEventsFunction";

export async function createSubscriptionClient({
  harness,
  parseEvents,
}: {
  harness: IndexerHarness;
  parseEvents: ParseEventsFunction;
}) {
  switch (harness.type) {
    case EndpointType.WEBSOCKET:
      const wsClient = await CometWsClient.create(
        harness.wsUrl,
        harness.retrier,
        parseEvents,
      );
      return wsClient;
    case EndpointType.HTTP_POLL:
      const httpClient = await CometHttpPollClient.create(
        harness.httpUrl,
        harness.retrier,
        parseEvents,
      );
      return httpClient;
  }
}
