import { BackfillOrder } from "./BackfillOrder";
import type { BackfillHarness } from "./Harness";
import type { LevelWithSilentOrString } from "pino";

/**
 * Parameters required to setup a backfiller that feeds into a PostgreSQL database.
 */
export type CreateBackfillerFunction = {
  backfillSetup:
    | {
        // Backfill unprocessed blocks in ascending or descending order of block height
        backfillOrder:
          | typeof BackfillOrder.DESCENDING
          | typeof BackfillOrder.ASCENDING;
      }
    | {
        // Backfill unprocessed blocks  in any order of block height in a parallel manner
        backfillOrder: typeof BackfillOrder.PARALLEL;
        numThreads: number;
      }
    | {
        // Backfill specified blocks in order of position in blockHeightsToProcess
        backfillOrder: typeof BackfillOrder.SPECIFIC;
        blockHeightsToProcess: number[];
        // If false, skip persisting each block after indexing
        shouldPersist: boolean;
      };
  // Structure that maintains a single indexer and relevant network parameters
  harness: BackfillHarness;
  // Minimum Pino log level for printing info, warning, error, and fatal indexer logs
  minLogLevel?: LevelWithSilentOrString;
};

export type BackfillSetup = CreateBackfillerFunction["backfillSetup"];
