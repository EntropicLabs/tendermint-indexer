import type { TmEvent } from "../types/Events";
import type { EventFilter } from "../types/Subscription";

/**
 * Checks if an event passes an indexer's event filter
 * @param event The event that is being checked
 * @param filter Match or include filter
 * @returns True if the event matches the filter
 */
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
