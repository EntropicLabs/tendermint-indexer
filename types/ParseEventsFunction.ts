import type { ConnectionEvent, NewBlockEvent } from "./Events";

export type ParseEventsFunction = (
  event: NewBlockEvent | ConnectionEvent,
) => void;
