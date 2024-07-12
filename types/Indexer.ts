import type {
  Block,
  BlockResultsResponse,
  TxData,
} from "@cosmjs/tendermint-rpc";
import type { ValuesUnion } from "./ValuesUnion";

/**
 * Data passed into an indexer, including the event type, event attributes,
 * and the block that the event came from
 */
export type EventIndexer = {
  eventAttributes: Record<string, string>;
  eventType: string;
  blockHeight: number;
};

export type BlockIndexer = {
  block: Block;
  blockResults: BlockResultsResponse;
  blockHeight: number;
};

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
