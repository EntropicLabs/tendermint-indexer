import type { Indexer } from "../modules/indexer";
import type { Retrier } from "../modules/retry";
import type { EndpointType } from "./EndpointType";

/**
 * Define one or multiple indexers and retrier for indexing live block data,
 * along with a network connection type.
 */
export type IndexerHarness = {
  indexers: Indexer[];
  // Retries any failed network calls and connection attempts
  retrier?: Retrier;
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

/**
 * Define a single indexer and retrier for backfilling historical block data.
 * No WebSocket or HTTP polling connection necessary.
 */
export type BackfillHarness = {
  indexer: Indexer;
    // Retries any failed network calls and connection attempts
  retrier?: Retrier;
  httpUrl: `http://${string}` | `https://${string}`;
};
