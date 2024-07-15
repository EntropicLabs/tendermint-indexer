import { TEST_ARCHIVE_HTTP_URL } from "./consts";
import { BackfillSetup } from "../dist/src/types/CreateBackfillerFunction";
import { SQLPersister } from "../src/modules/sqlPersister";
import {
  createBackfiller,
  createExpBackoffRetrier,
  BlockIndexer,
  EventIndexer,
  Indexer,
  IndexerDataType,
  Subscription,
  TxIndexer,
  CometHttpClient,
  BlockRange,
} from "../src";

async function testBackfiller(backfillSetup: BackfillSetup) {
  let gotEvent = false;
  let gotBlock = false;
  let gotTx = false;
  let blockHeights: BlockRange[] = [];

  const retrier = createExpBackoffRetrier({
    initialInterval: 1000,
    expFactor: 2,
    maxInterval: 60000,
    jitter: 1000,
  });

  const httpClient = await CometHttpClient.create(
    TEST_ARCHIVE_HTTP_URL,
    retrier
  );

  class BasicIndexer implements Indexer {
    persister: SQLPersister;

    public static async create() {
      const persister = new SQLPersister(
        async (query) => {
          if (query.includes("SELECT *")) {
            // Simulate get all unprocessed blocks logic
            const { latestBlockHeight } = await httpClient.getBlockHeights();
            // Ensures that the backfiller backfills blocks 12000001 to 12000010
            return [
              { startBlockHeight: 1, endBlockHeight: 2 },
              { startBlockHeight: 3, endBlockHeight: 5 },
              { startBlockHeight: 6, endBlockHeight: 12000000 },
              { startBlockHeight: 12000011, endBlockHeight: 12000014 },
              { startBlockHeight: 12000015, endBlockHeight: latestBlockHeight },
            ];
          } else if (query.includes("SELECT 1")) {
            // Simulate updateMinOrMaxRecord logic
            const selectSplit = query.split("SELECT ")[1].split(",");
            const startBlockHeight = parseInt(selectSplit[0].trim());
            const endBlockHeight = parseInt(
              selectSplit[1].split("WHERE NOT EXISTS (")[0].trim()
            );

            if (blockHeights.length === 0) {
              blockHeights.push({ startBlockHeight, endBlockHeight });
            }

            // Simulate SQL UPDATE BY update block height records in a list
            if (query.includes("LEAST")) {
              for (let idx = 0; idx < blockHeights.length; idx++) {
                if (blockHeights[idx].endBlockHeight === endBlockHeight) {
                  blockHeights[idx].startBlockHeight = Math.min(
                    startBlockHeight,
                    blockHeights[idx].startBlockHeight
                  );
                  return [];
                }
              }
            } else {
              for (let idx = 0; idx < blockHeights.length; idx++) {
                if (blockHeights[idx].startBlockHeight === startBlockHeight) {
                  blockHeights[idx].endBlockHeight = Math.max(
                    endBlockHeight,
                    blockHeights[idx].endBlockHeight
                  );
                  return [];
                }
              }
            }
            // Simulate SQL INSERT BY pushing block height records to a list
            blockHeights.push({ startBlockHeight, endBlockHeight });
          }
          return [];
        },
        "blockHeight",
        httpClient
      );
      await persister.setup();
      return new BasicIndexer(persister);
    }

    constructor(persister: SQLPersister) {
      this.persister = persister;
    }

    public async destroy(): Promise<void> {}

    private async eventIndexer({}: EventIndexer) {
      gotEvent = true;
    }

    private async blockIndexer({}: BlockIndexer) {
      gotBlock = true;
    }

    private async txIndexer({}: TxIndexer) {
      gotTx = true;
    }

    public subscriptions(): Subscription[] {
      return [
        {
          filter: {
            eventType: {
              matches: ["transfer"],
              contains: ["a"],
            },
          },
          indexer: this.eventIndexer.bind(this),
          type: IndexerDataType.EVENT,
        },
        {
          indexer: this.blockIndexer.bind(this),
          type: IndexerDataType.BLOCK,
        },
        {
          indexer: this.txIndexer.bind(this),
          type: IndexerDataType.TX,
        },
      ];
    }
  }

  const singleIndexer = await BasicIndexer.create();

  const backfiller = await createBackfiller({
    harness: {
      indexer: singleIndexer,
      retrier,
      httpUrl: TEST_ARCHIVE_HTTP_URL,
    },
    backfillSetup: backfillSetup,
  });

  await backfiller.start();
  await backfiller.destroy();

  expect(gotBlock).toBe(true);
  expect(gotTx).toBe(true);
  expect(gotEvent).toBe(true);
  return blockHeights;
}

test("Succeed in ascending backfill", async () => {
  const blockHeights = await testBackfiller({ backfillOrder: "ASCENDING" });
  expect(blockHeights).toEqual([
    {
      startBlockHeight: 12000001,
      endBlockHeight: 12000010,
    },
  ]);
}, 15000);

test("Succeed in descending backfill", async () => {
  const blockHeights = await testBackfiller({ backfillOrder: "DESCENDING" });
  expect(blockHeights).toEqual([
    {
      startBlockHeight: 12000001,
      endBlockHeight: 12000010,
    },
  ]);
}, 15000);

test("Succeed in parallel backfill", async () => {
  const blockHeights = await testBackfiller({
    backfillOrder: "PARALLEL",
    numThreads: 3,
  });
  expect(blockHeights).toEqual([
    {
      startBlockHeight: 12000001,
      endBlockHeight: 12000010,
    },
  ]);
}, 15000);

test("Succeed in specific backfill", async () => {
  const blockHeights = await testBackfiller({
    backfillOrder: "SPECIFIC",
    blockHeightsToProcess: [12000001, 12000009, 12000003],
  });
  expect(blockHeights).toEqual([
    {
      startBlockHeight: 12000001,
      endBlockHeight: 12000001,
    },
    {
      startBlockHeight: 12000009,
      endBlockHeight: 12000009,
    },
    {
      startBlockHeight: 12000003,
      endBlockHeight: 12000003,
    },
  ]);
}, 15000);
