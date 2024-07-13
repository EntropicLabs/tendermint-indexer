import type { Subscription } from "../types/Subscription";
import type { Persister } from "./persister";

// An interface for a general indexer
export abstract class Indexer {
  abstract persister: Persister;
  public abstract subscriptions(): Subscription[];
  public abstract destroy(): Promise<void>;
}
