import { expose } from "threads/worker";
import backfillBlockRange from "../utils/backfillBlockRange";

// TODO: Make sure of multithreading for backfiller
expose(backfillBlockRange);
