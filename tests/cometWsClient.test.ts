import { createRetrier } from "../src/modules/retry";
import { TEST_BAD_WS_URL, TEST_WS_URL } from "./consts";
import { CometWsClient } from "../src/clients/cometWsClient";
import { checkErrorThrow } from "./utils";
import { isConnectionEvent } from "../src/types/Events";
import { sleep } from "../src/utils/sleep";

test("Successfully listen and destroy WS Client with proper block height ordering", async () => {
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

  const wsClient = await CometWsClient.create(TEST_WS_URL, retrier, (event) => {
    if (isConnectionEvent(event)) {
      gotStart = gotStart || event.isStart;
      gotEnd = gotEnd || !event.isStart;
      return;
    }
    gotData = true;
    blockData.push(event.blockHeight);
  });
  await wsClient.listen();
  expect(wsClient.connected).toBe(true);
  while (blockData.length < 3) {
    await sleep(1000);
  }
  await wsClient.destroy();

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

test("Successfully listen, disconnect, and re-listen WS client with proper block height ordering", async () => {
  const retrier = createRetrier(
    {
      maxRetries: 3,
    },
    () => 500
  );

  let gotStart = false;
  let gotEnd = false;
  let gotData = true;
  let gotDataSecond = false;
  const blockData: number[] = [];

  const wsClient = await CometWsClient.create(TEST_WS_URL, retrier, (event) => {
    if (isConnectionEvent(event)) {
      gotStart = gotStart || event.isStart;
      gotEnd = gotEnd || !event.isStart;
      return;
    }
    gotData = true;
    if (gotEnd) {
      gotDataSecond = true;
    }
    blockData.push(event.blockHeight);
  });
  await wsClient.listen();
  expect(wsClient.connected).toBe(true);
  while (blockData.length < 3) {
    await sleep(1000);
  }
  await wsClient.destroy();
  await wsClient.listen();
  while (blockData.length < 6) {
    await sleep(1000);
  }
  await wsClient.destroy();
  expect(gotStart).toBe(true);
  expect(gotEnd).toBe(true);
  expect(gotData).toBe(true);
  expect(gotDataSecond).toBe(true);

  /**
   * Make sure that connection events and new block events were receieved
   * and all block events were ordered by ascending heights
   **/
  for (let idx = 0; idx < blockData.length - 1; idx++) {
    expect(blockData[idx]).toBeLessThan(blockData[idx + 1]);
  }
}, 30000);

test("Fail to listen with improper WebSocket URL", async () => {
  const retrier = createRetrier(
    {
      maxRetries: 1,
    },
    () => 500
  );

  expect(
    await checkErrorThrow(async () => {
      const wsPollClient = await CometWsClient.create(
        TEST_BAD_WS_URL,
        retrier,
        () => {}
      );

      await wsPollClient.listen();
    })
  ).toBe(true);
});
