import type { TmEvent } from "../types/Events";
import type { EventFilter } from "../types/Subscription";

export function matchesEventFilter(
  event: TmEvent,
  filter: EventFilter,
): boolean {
  if (filter.eventType.matches?.includes(event.type)) {
    return true;
  }

  if (
    filter.eventType.contains?.some((eventType) =>
      event.type.includes(eventType),
    )
  ) {
    return true;
  }

  return false;
}
