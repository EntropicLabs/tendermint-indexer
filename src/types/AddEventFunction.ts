import type { ConnectionEvent, NewBlockEvent } from "./Events";

export type AddEventFunction = (event: NewBlockEvent | ConnectionEvent) => void;
