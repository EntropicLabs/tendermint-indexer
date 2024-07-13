import { BackfillOrder } from "./BackfillOrder";
import type { BackfillHarness } from "./Harness";
import type { LevelWithSilentOrString } from "pino";

/**
 * Parameters required to setup a backfiller that feeds into a PostgreSQL database.
 */
export type CreateBackfillerFunction = {
  backfillSetup:
    | {
        backfillOrder:
          | typeof BackfillOrder.DESCENDING
          | typeof BackfillOrder.ASCENDING;
      }
    | {
        backfillOrder: typeof BackfillOrder.PARALLEL;
        numThreads: number;
      }
    | {
        backfillOrder: typeof BackfillOrder.SPECIFIC;
        blockHeightsToProcess: number[];
      };
  harness: BackfillHarness;
  minLogLevel?: LevelWithSilentOrString;
};

export type BackfillSetup = CreateBackfillerFunction["backfillSetup"];
