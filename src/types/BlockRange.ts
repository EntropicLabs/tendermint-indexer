/**
 * Represents an inclusive range of blocks
 */
export type BlockRange = {
  startBlockHeight: number;
  endBlockHeight: number;
};

/**
 * Represents a block range stored in a SQL database with a unqiue id
 */
export type PGBlockRange = BlockRange & { id: number };

/**
 * Represents a merged range consisting of multiple unique PGBlockRanges
 */
export type MergedRange = BlockRange & { ids: number[] };

/**
 * Represents ranges that after merging should get updated or deleted
 */
export type MergedRanges = {
  rangesToDelete: number[];
  rangesToUpdate: PGBlockRange[];
};
