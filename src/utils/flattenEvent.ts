import type { RawTmEvent, TmEvent } from "../types/Events";

/**
 * Converts a Raw Tendermint event into a Tendermint event with easily accessible data
 */
export default function flattenEvent(event: RawTmEvent): TmEvent {
  const attrs = event.attributes.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
  return { type: event.type, attributes: attrs };
}
