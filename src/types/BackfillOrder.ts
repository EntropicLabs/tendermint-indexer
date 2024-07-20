import type { ValuesUnion } from "./ValuesUnion";

export const BackfillOrder = {
  // Processed all unprocessed blocks in a one-by-one order
  ASCENDING: "ASCENDING",
  DESCENDING: "DESCENDING",
  // Process all unprocessed blocks in a concurrent order
  CONCURRENT: "CONCURRENT",
  // Only processess specified blocks
  SPECIFIC: "SPECIFIC",
} as const;

export type BackfillOrder = ValuesUnion<typeof BackfillOrder>;
