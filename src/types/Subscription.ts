import type {
  IndexerDataType,
  BlockIndexer,
  EventIndexer,
  TxIndexer,
} from "./Indexer";

/**
 * Data necessary for setting up a subscription to a Tendermint RPC Node and indexing
 */

export type EventFilter = {
  eventType: {
    matches?: string[];
    contains?: string[];
  };
};

export type BlockSubscription = {
  type: typeof IndexerDataType.BLOCK;
  indexer: (arg: BlockIndexer) => void;
};

export type TxSubscription = {
  indexer: (arg: TxIndexer) => void;
  type: typeof IndexerDataType.TX;
};

export type EventSubscription = {
  filter?: EventFilter;
  indexer: (arg: EventIndexer) => void;
  type: typeof IndexerDataType.EVENT;
};

export type Subscription =
  | BlockSubscription
  | TxSubscription
  | EventSubscription;
