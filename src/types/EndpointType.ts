import type { ValuesUnion } from "./ValuesUnion";

/**
 * Supported network connections for subscribing to Tendermint RPC nodes
 */
export const EndpointType = {
  HTTP_POLL: "HTTP_POLL",
  WEBSOCKET: "WEBSOCKET",
} as const;

export type EndpointType = ValuesUnion<typeof EndpointType>;
