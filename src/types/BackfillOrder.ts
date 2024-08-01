import type { ValuesUnion } from "./ValuesUnion";

export const BackfillOrder = {
  // Processed all unprocessed block ranges in a one-by-one order
  ASCENDING: "ASCENDING",
  DESCENDING: "DESCENDING",
  // Process all unprocessed block ranges in a concurrent order
  CONCURRENT: "CONCURRENT",
  // Process specified blocks in a concurrent order
  CONCURRENT_SPECIFIC: "CONCURRENT_SPECIFIC",
  // Only processess specified blocks
  SPECIFIC: "SPECIFIC",
} as const;

export type BackfillOrder = ValuesUnion<typeof BackfillOrder>;
