import type {
  Block,
  BlockResultsResponse,
  TxData,
} from "@cosmjs/tendermint-rpc";
import type { ValuesUnion } from "./ValuesUnion";

/**
 * Data passed into an Event indexer: event type, event attributes, and block height.
 */
export type EventIndexer = {
  eventAttributes: Record<string, string>;
  eventType: string;
  blockHeight: number;
};

/**
 * Data passed into an Block indexer: block header, block results, and block height.
 */
export type BlockIndexer = {
  block: Block;
  blockResults: BlockResultsResponse;
  blockHeight: number;
};

/**
 * Data passed into an Transaction (Tx) indexer: list of transactions and block height.
 */
export type TxIndexer = {
  tx: readonly TxData[];
  blockHeight: number;
};

export const IndexerDataType = {
  BLOCK: "BLOCK",
  EVENT: "EVENT",
  TX: "TX",
} as const;

export type IndexerDataType = ValuesUnion<typeof IndexerDataType>;
