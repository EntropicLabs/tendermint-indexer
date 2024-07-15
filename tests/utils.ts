export async function checkErrorThrow(callback: () => Promise<void>) {
  try {
    await callback();
    return false;
  } catch {
    return true;
  }
}
