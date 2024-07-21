import type { LevelWithSilentOrString } from "pino";
import type { IndexerHarness } from "./Harness";

/**
 * Parameters required to setup an indexer that feeds into a PostgreSQL database.
 */
export type CreateIndexerParams = {
  // Structure that maintains one or many indexers and relevant network parameters
  harness: IndexerHarness;
  // Minimum Pino log level for printing info, warning, error, and fatal indexer logs
  minLogLevel?: LevelWithSilentOrString;
};