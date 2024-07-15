import type {
  IndexerDataType,
  BlockIndexer,
  EventIndexer,
  TxIndexer,
} from "./Indexer";

/**
 * Exact match or partial containment filter for event types such as "transfer" and "mint"
 */
export type EventFilter = {
  eventType: {
    matches?: string[];
    contains?: string[];
  };
};

/**
 * Subscription for a block
 */
export type BlockSubscription = {
  type: typeof IndexerDataType.BLOCK;
  indexer: (arg: BlockIndexer) => void;
};

/**
 * Subscription for a transaction
 */
export type TxSubscription = {
  indexer: (arg: TxIndexer) => void;
  type: typeof IndexerDataType.TX;
};

/**
 * Subscription for an event
 */
export type EventSubscription = {
  filter?: EventFilter;
  indexer: (arg: EventIndexer) => void;
  type: typeof IndexerDataType.EVENT;
};

/**
 * Subscription for an event, transaction, or block. Indexer callback
 * gets invoked with new or historical block data.
 */
export type Subscription =
  | BlockSubscription
  | TxSubscription
  | EventSubscription;
