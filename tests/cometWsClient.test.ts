import { createRetrier } from "../src/modules/retry";
import { TEST_BAD_WS_URL, TEST_WS_URL } from "./consts";
import { CometWsClient } from "../src/clients/cometWsClient";
import { checkErrorThrow } from "./utils";
import { isConnectionEvent } from "../src/types/Events";
import { sleep } from "../src/utils/sleep";

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

test("Successfully listen and destroy WebSocket Client", async () => {
  const retrier = createRetrier(
    {
      maxRetries: 1,
    },
    () => 500
  );

  let gotStart = false;
  let gotEnd = false;
  let gotData = false;

  const wsClient = await CometWsClient.create(TEST_WS_URL, retrier, (event) => {
    if (isConnectionEvent(event)) {
      gotStart = gotStart || event.isStart;
      gotEnd = gotEnd || !event.isStart;
      return;
    }
    gotData = true;
  });
  await wsClient.listen();
  expect(wsClient.connected).toBe(true);
  await sleep(4000);
  await wsClient.destroy();
  expect(gotStart).toBe(true);
  expect(gotEnd).toBe(true);
  expect(gotData).toBe(true);
}, 10000);

test("Listen, disconnect, and re-listen", async () => {
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
  });
  await wsClient.listen();
  expect(wsClient.connected).toBe(true);
  await sleep(4000);
  await wsClient.destroy();
  await wsClient.listen();
  await sleep(4000);
  await wsClient.destroy();
  expect(gotStart).toBe(true);
  expect(gotEnd).toBe(true);
  expect(gotData).toBe(true);
  expect(gotDataSecond).toBe(true);
}, 14000);
