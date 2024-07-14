export function mapAndFilterNull<S, T>(
    list: S[],
    func: (data: S, idx: number) => T | null,
  ): T[] {
    return list.map(func).filter((d: T | null): d is T => d != null);
  }
  