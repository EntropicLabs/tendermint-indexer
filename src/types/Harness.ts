import type { Indexer } from "../modules/indexer";
import type { Retrier } from "../modules/retry";
import type { EndpointType } from "./EndpointType";

export type IndexerHarness = {
  indexers: Indexer[];
  retrier: Retrier;
} & (
  | {
      type: typeof EndpointType.WEBSOCKET;
      wsUrl: `ws://${string}` | `wss://${string}`;
      httpUrl: `http://${string}` | `https://${string}`;
    }
  | {
      type: typeof EndpointType.HTTP_POLL;
      httpUrl: `http://${string}` | `https://${string}`;
    }
);

export type BackfillHarness = {
  indexer: Indexer;
  retrier: Retrier;
  httpUrl: `http://${string}` | `https://${string}`;
};
