import type { BlockRange } from "../types/BlockRange";

// An interface for a persister, which is a source of truth on
// which blocks have been indexed
export abstract class Persister {
  public abstract getUnprocessedBlockRanges(): Promise<BlockRange[]>;
  public abstract persistBlock(blockHeight: number): Promise<void>;
}
