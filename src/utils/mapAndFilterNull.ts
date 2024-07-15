/**
 * Applies a mapper to a list of data and returns non-null data
 * @param list List of data to be mapped
 * @param func A mapper function applied to each element in the list
 * @returns A non-null list of mapped data
 */
export function mapAndFilterNull<S, T>(
  list: S[],
  func: (data: S, idx: number) => T | null
): T[] {
  return list.map(func).filter((d: T | null): d is T => d != null);
}
