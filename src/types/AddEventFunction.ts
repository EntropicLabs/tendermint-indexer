import type { ConnectionEvent, NewBlockEvent } from "./Events";

/**
 * Type for the handler that adds new blocks or new connection events to a processing queue
 */
export type AddEventFunction = (event: NewBlockEvent | ConnectionEvent) => void;
