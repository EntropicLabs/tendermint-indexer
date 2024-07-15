import type {
  Block,
  BlockResultsResponse,
  TxData,
} from "@cosmjs/tendermint-rpc";
import type { TmEvent } from "./Events";

/**
 * Relevant block data fetched from the Tendermint RPC client
 */
export type BlockData = {
  block: Block;
  blockResults: BlockResultsResponse;
  events: TmEvent[];
  tx: readonly TxData[];
};
