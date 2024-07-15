import { CometHttpPollClient } from "../src/clients/cometHttpPollClient";
import { createRetrier } from "../src/modules/retry";
import { sleep } from "../src/utils/sleep";
import { TEST_ARCHIVE_HTTP_URL } from "./consts";
import { isConnectionEvent } from "../src/types/Events";

test("Successfully listen and destroy HTTP Poll Client", async () => {
  const retrier = createRetrier(
    {
      maxRetries: 1,
    },
    () => 500
  );

  let gotStart = false;
  let gotEnd = false;
  let gotData = false;

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
    }
  );
  await httpPollClient.listen();
  expect(httpPollClient.height).toBeGreaterThan(100);
  await sleep(4000);
  await httpPollClient.destroy();
  expect(gotStart).toBe(true);
  expect(gotEnd).toBe(true);
  expect(gotData).toBe(true);
});
