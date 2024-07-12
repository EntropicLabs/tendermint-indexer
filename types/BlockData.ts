import type {
  Block,
  BlockResultsResponse,
  TxData,
} from "@cosmjs/tendermint-rpc";
import type { TmEvent } from "./Events";

export type BlockData = {
  block: Block;
  blockResults: BlockResultsResponse;
  events: TmEvent[];
  tx: readonly TxData[];
};
