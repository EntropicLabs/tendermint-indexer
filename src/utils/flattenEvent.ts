import type { RawTmEvent, TmEvent } from "../types/Events";

export default function flattenEvent(event: RawTmEvent): TmEvent {
  const attrs = event.attributes.reduce(
    (acc, { key, value }) => {
      acc[key] = value;
      return acc;
    },
    {} as Record<string, string>,
  );
  return { type: event.type, attributes: attrs };
}
