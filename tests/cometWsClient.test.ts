import { createRetrier } from "../src/modules/retry";
import { TEST_BAD_WS_URL, TEST_WS_URL } from "./consts";
import { CometWsClient } from "../src/clients/cometWsClient";
import { checkErrorThrow, TestWebSocketServer } from "./utils";
import { isConnectionEvent } from "../src/types/Events";
import { sleep } from "../src/utils/sleep";

test("Successfully listen and disconnect WS Client with proper block height ordering", async () => {
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
  await wsClient.disconnect();

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
  await wsClient.disconnect();
  await wsClient.listen();
  while (blockData.length < 6) {
    await sleep(1000);
  }
  await wsClient.disconnect();
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

test("Successfully listen, disconnect on protocol error, and re-listen WS client with proper block height ordering", async () => {
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
  await wsClient.disconnect(1002);
  while (blockData.length < 6) {
    await sleep(1000);
  }
  await wsClient.disconnect();
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

test("Successfully connect after a few WS disconnects", async () => {
  const wsServer = new TestWebSocketServer(3000);
  wsServer.start();

  const retrier = createRetrier(
    {
      maxRetries: 4,
    },
    () => 500
  );

  let gotBlockCounter = 0;

  const wsClient = await CometWsClient.create(
    "ws://localhost:3000/",
    retrier,
    (event) => {
      if (isConnectionEvent(event)) {
        return;
      }
      gotBlockCounter += 1;
    }
  );

  await wsClient.listen();
  await sleep(3000);

  /** 
   * Expect to only get 1 block since the test WebSocket server only sends one block per connection
   * If multiple connections are created, then this test will fail.
  **/
  expect(gotBlockCounter).toBe(1);
  wsServer.stop();
}, 10000);

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
