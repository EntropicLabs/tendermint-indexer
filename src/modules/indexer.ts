import type { Subscription } from "../types/Subscription";
import type { Persister } from "./persister";

/**
 * An interface for a general indexer
 */
export abstract class Indexer {
  /**
   * Optional persister that retries on indexer failures, including network failures
   */
   abstract persister?: Persister;
  /**
   * List of event, block, or transaction subscriptions
   */
  public abstract subscriptions(): Subscription[];
  /**
   * Callback for destroying the indexer
   */
  public abstract destroy(): Promise<void>;
}

export abstract class PersistantIndexer extends Indexer {
  /**
   * Required persister that retries on indexer failures, including network failures
   */
   abstract persister: Persister;
}