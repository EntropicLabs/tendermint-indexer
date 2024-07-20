import type { Indexer, PersistantIndexer } from "../modules/indexer";
import type { Retrier } from "../modules/retry";
import type { EndpointType } from "./EndpointType";

/**
 * Define one or multiple indexers and retrier for indexing live block data,
 * along with a network connection type.
 */
export type IndexerHarness = {
  indexers: Indexer[];
  /** Retries any failed network calls and connection attempts. 
   * If null, an exponential backoff retrier that switches to linear backoff at a 60 seconds
   * threshold will be used.
  */
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
  /** Only a single indexer is allowed per backfill since different indexers may have different
   * ranges of unprocessed blocks.
   */
  indexer: PersistantIndexer;
  /** Retries any failed network calls and connection attempts. 
   * If null, an exponential backoff retrier that switches to linear backoff at a 60 seconds
   * threshold will be used.
  */
  retrier?: Retrier;
  httpUrl: `http://${string}` | `https://${string}`;
};
