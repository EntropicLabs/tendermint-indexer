import { CometHttpPollClient } from "../src/clients/cometHttpPollClient";
import { createRetrier } from "../src/modules/retry";
import { sleep } from "../src/utils/sleep";
import { TEST_ARCHIVE_HTTP_URL } from "./consts";
import { isConnectionEvent } from "../src/types/Events";

test("Successfully listen and destroy HTTP Poll Client with proper block height ordering", async () => {
  const retrier = createRetrier(
    {
      maxRetries: 1,
    },
    () => 500
  );

  let gotStart = false;
  let gotEnd = false;
  let gotData = false;
  const blockData: number[] = [];

  const httpPollClient = await CometHttpPollClient.create(
    TEST_ARCHIVE_HTTP_URL,
    retrier,
    (event) => {
      if (isConnectionEvent(event)) {
        gotStart = gotStart || event.isStart;
        gotEnd = gotEnd || !event.isStart;
        return;
      }
      gotData = true;
      blockData.push(event.blockHeight);
    }
  );
  await httpPollClient.listen();
  expect(httpPollClient.height).toBeGreaterThan(100);

  while (blockData.length < 3) {
    await sleep(1000);
  }

  await httpPollClient.destroy();

  /**
   * Make sure that connection events and new block events were receieved
   * and all block events were ordered by ascending heights
   **/
  expect(gotStart).toBe(true);
  expect(gotEnd).toBe(true);
  expect(gotData).toBe(true);

  for (let idx = 0; idx < blockData.length - 1; idx++) {
    expect(blockData[idx]).toBe(blockData[idx + 1] - 1);
  }
}, 30000);

test("Successfully listen, disconnect, and re-listen HTTP client with proper block height ordering", async () => {
  const retrier = createRetrier(
    {
      maxRetries: 1,
    },
    () => 500
  );

  let gotStart = false;
  let gotEnd = false;
  let gotData = false;
  let gotData2 = false;
  const blockData: number[] = [];

  const httpPollClient = await CometHttpPollClient.create(
    TEST_ARCHIVE_HTTP_URL,
    retrier,
    (event) => {
      if (isConnectionEvent(event)) {
        gotStart = gotStart || event.isStart;
        gotEnd = gotEnd || !event.isStart;
        return;
      }
      gotData = true;
      if (gotEnd) {
        gotData2 = true;
      }
      blockData.push(event.blockHeight);
    }
  );
  await httpPollClient.listen();
  expect(httpPollClient.height).toBeGreaterThan(100);
  expect(httpPollClient.connected).toBe(true);
  while (blockData.length < 2) {
    await sleep(1000);
  }
  await httpPollClient.destroy();
  await httpPollClient.listen();
  while (blockData.length < 4) {
    await sleep(1000);
  }
  await httpPollClient.destroy();

  /**
   * Make sure that connection events and new block events were receieved
   * and all block events were ordered by ascending heights
   **/
  expect(gotStart).toBe(true);
  expect(gotEnd).toBe(true);
  expect(gotData).toBe(true);
  expect(gotData2).toBe(true);

  for (let idx = 0; idx < blockData.length - 1; idx++) {
    expect(blockData[idx]).toBeLessThan(blockData[idx + 1]);
  }
}, 40000);
