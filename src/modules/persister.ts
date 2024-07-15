import type { BlockRange } from "../types/BlockRange";

/**
 * An interface for a persister, which is a source of truth on
 * which blocks have been indexed
*/
export abstract class Persister {
  /**
   * Returns block ranges of unproccessed blocks. 
   * Used by the backfiller to know which blocks to backfill.
   */
  public abstract getUnprocessedBlockRanges(): Promise<BlockRange[]>;
  /**
   * Records a block as having been successfully indexed or backfilled.
   * @param blockHeight block height
   */
  public abstract persistBlock(blockHeight: number): Promise<void>;
}
