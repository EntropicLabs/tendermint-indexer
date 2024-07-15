import { sleep } from "../src/utils/sleep";

test("Sleep 1 second", async () => {
  var startTime = performance.now();
  await sleep(1000);
  var endTime = performance.now();
  expect(endTime - startTime).toBeGreaterThanOrEqual(980);
  expect(endTime - startTime).toBeLessThanOrEqual(1020);
});
