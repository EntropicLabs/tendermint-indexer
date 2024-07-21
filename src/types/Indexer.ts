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
  // Attribute data associted with the indexed event
  eventAttributes: Record<string, string>;
  // The type of the indexed event
  eventType: string;
  blockHeight: number;
};

/**
 * Data passed into an Block indexer: block header, block results, and block height.
 */
export type BlockIndexer = {
  // Contains header, transactions, last commit, and evidence
  block: Block;
  // Contains transactions, validator updates, and consensus updates
  blockResults: BlockResultsResponse;
  blockHeight: number;
};

/**
 * Data passed into an Transaction (Tx) indexer: list of transactions and block height.
 */
export type TxIndexer = {
  // Contains events ad gas for each transaction in the indexed block
  tx: readonly TxData[];
  blockHeight: number;
};

export const IndexerDataType = {
  BLOCK: "BLOCK",
  EVENT: "EVENT",
  TX: "TX",
} as const;

export type IndexerDataType = ValuesUnion<typeof IndexerDataType>;
