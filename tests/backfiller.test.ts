import { TEST_ARCHIVE_HTTP_URL } from "./consts";
import { BackfillSetup, Persister } from "../src";
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

  class BasicPersister implements Persister {
    public async getUnprocessedBlockRanges(): Promise<BlockRange[]> {
      // Ensures that the backfiller backfills blocks 12000001 to 12000010
      return [{ startBlockHeight: 12000001, endBlockHeight: 12000010 }];
    }

    public async persistBlock(blockHeight: number): Promise<void> {
      for (let idx = 0; idx < blockHeights.length; idx++) {
        if (blockHeights[idx].endBlockHeight === blockHeight - 1) {
          blockHeights[idx].endBlockHeight = blockHeight;
          return;
        } else if (blockHeights[idx].startBlockHeight === blockHeight + 1) {
          blockHeights[idx].startBlockHeight = blockHeight;
          return;
        }
      }

      blockHeights.push({
        startBlockHeight: blockHeight,
        endBlockHeight: blockHeight,
      });
      blockHeights.sort((a, b) => a.startBlockHeight - b.startBlockHeight);
    }
  }

  class BasicIndexer implements Indexer {
    persister: BasicPersister;

    constructor() {
      this.persister = new BasicPersister();
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

  const backfiller = await createBackfiller({
    harness: {
      indexer: new BasicIndexer(),
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

test("Succeed in concurrent backfill", async () => {
  const blockHeights = await testBackfiller({
    backfillOrder: "CONCURRENT",
    numProcesses: 3,
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
    shouldPersist: true,
  });
  expect(blockHeights).toEqual([
    {
      startBlockHeight: 12000001,
      endBlockHeight: 12000001,
    },
    {
      startBlockHeight: 12000003,
      endBlockHeight: 12000003,
    },
    {
      startBlockHeight: 12000009,
      endBlockHeight: 12000009,
    },
  ]);
}, 15000);
