import type { LevelWithSilentOrString } from "pino";
import type { IndexerHarness } from "./Harness";

/**
 * Parameters required to setup an indexer that feeds into a PostgreSQL database.
 */
export type CreateIndexerFunction = {
  harness: IndexerHarness;
  minLogLevel?: LevelWithSilentOrString;
};