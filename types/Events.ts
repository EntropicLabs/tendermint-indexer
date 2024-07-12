/**
 * Represents an event where the network connection is started by the user or indexer
 * and ended by the user, network drop, or error.
 */
export type ConnectionEvent = {
  isStart: boolean;
};

/**
 * Represents events for a specific block fetched from an HTTP call to a Tendermint RPC node.
 */
export type NewBlockEvent = {
  blockHeight: number;
};

/**
 * Represents Tendermint Events that have been queued by the indexer and are ready to process.
 */
export type QueuedTxTmEvents = {
  tmEvents: TmEvent[];
  txEventQuery?: string;
};

/**
 * A single Tendermint event from a Transaction or Block.
 * Directly in the format received from the Tendermint RPC node.
 */
export type RawTmEvent = {
  attributes: readonly { key: string; value: string }[];
  type: string;
};

/**
 * A single Tendermint event from a Transaction or Block.
 * The attributes are parsed into a Record for simpler lookup.
 */
export type TmEvent = {
  attributes: Record<string, string>;
  type: string;
};

/**
 * Represents data received from a WebSocket event from a Tendermint RPC node.
 */
export type WSEventResult = {
  data: {
    type: string;
    value: any;
  };
  query: string;
  events: { [key: string]: string[] };
};

export type WSEvent = {
  id: string;
  jsonrpc: string;
  result: WSEventResult | Record<string, never>;
};

/**
 * Type guard for WSEventResult.
 * @param data - The data to check.
 * @returns True if the data is a WSEventResult.
 */
export function isWSEventResult(
  data: WSEventResult | Record<string, never>,
): data is WSEventResult {
  return Object.keys(data).length > 0;
}

/**
 * Type guard for WSEvent.
 * @param data - The data to check.
 * @returns True if the data is a WSEvent.
 */
export function isWSEvent(data: any): data is WSEvent {
  if (typeof data !== "object" || data === null) return false;
  if (typeof data.jsonrpc !== "string") return false;
  if (typeof data.id !== "string") return false;
  if (!data.result || !isWSEventResult(data.result)) return false;

  const result = data.result;
  if (typeof result !== "object" || result === null) return false;
  if (typeof result.query !== "string") return false;
  if (typeof result.data !== "object" || result.data === null) return false;
  if (typeof result.data.type !== "string") return false;
  if (typeof result.events !== "object" || result.events === null) return false;

  for (const key in result.events) {
    if (
      !Array.isArray(result.events[key]) ||
      !result.events[key].every((item: unknown) => typeof item === "string")
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Type guard for RawTmEvent.
 * @param obj - The object to check.
 * @returns True if the object is a RawTmEvent.
 */
export function isRawTmEvent(obj: any): obj is RawTmEvent {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.type === "string" &&
    Array.isArray(obj.attributes) &&
    obj.attributes.every(
      (attr: any) =>
        typeof attr === "object" &&
        attr !== null &&
        typeof attr.key === "string" &&
        typeof attr.value === "string",
    )
  );
}

/**
 * Type guard for an array of RawTmEvent.
 * @param obj - The object to check.
 * @returns True if the object is an array of RawTmEvent.
 */
export function isRawTmEventArray(obj: any): obj is RawTmEvent[] {
  return Array.isArray(obj) && obj.every(isRawTmEvent);
}

/**
 * Type guard for ConnectionEvent.
 * @param obj - The object to check.
 * @returns True if the object is a ConnectionEvent.
 */
export function isConnectionEvent(obj: any): obj is ConnectionEvent {
  return (
    typeof obj === "object" && obj !== null && typeof obj.isStart === "boolean"
  );
}
