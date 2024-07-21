import type {
  MergedRange,
  MergedRanges,
  PGBlockRange,
} from "../types/BlockRange";

/**
 * Merges block ranges stored in the PostgreSQL database
 * @param allRanges Block ranges in ascending order of startBlockHeight
 * @returns Block ranges that have been merged and need to be updated in the PG Database, 
 * along with block ranges that need to be deleted
 */
export default function mergeRanges(allRanges: PGBlockRange[]): MergedRanges {
  if (allRanges.length === 0) {
    return {
      rangesToDelete: [],
      rangesToUpdate: [],
    };
  }

  const mergedRanges: MergedRange[] = [];
  let currentRange: MergedRange = { ...allRanges[0], ids: [allRanges[0].id] };
  for (let i = 1; i < allRanges.length; i++) {
    const nextRange = allRanges[i];
    // The ranges overlap if the end of the current range is >= to the start of the next range
    if (currentRange.endBlockHeight + 1 >= nextRange.startBlockHeight) {
      // Merge the ranges
      currentRange.endBlockHeight = Math.max(
        currentRange.endBlockHeight,
        nextRange.endBlockHeight
      );
      currentRange.ids.push(nextRange.id);
    } else {
      // No change, push the current range.
      mergedRanges.push(currentRange);
      currentRange = { ...nextRange, ids: [nextRange.id] };
    }
  }
  mergedRanges.push(currentRange);

  // Flatten all the ranges
  const rangesToDelete = mergedRanges
    .map((range) => {
      let [_, ...rest] = range.ids;
      return rest;
    })
    .flat();

  const rangesToUpdate = mergedRanges.map((range) => {
    const { ids, ...rest } = range;
    return {
      id: ids[0],
      ...rest,
    };
  });

  return {
    rangesToDelete,
    rangesToUpdate,
  };
}
