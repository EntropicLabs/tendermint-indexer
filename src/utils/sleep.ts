/**
 * Blocks the process for a specific number of milliseconds
 * @param ms Milliseconds to sleep for
 */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
