import {
  type BlockRange,
  Persister,
  Indexer,
  type Subscription,
  createIndexer,
  createExpBackoffRetrier,
  EndpointType,
  IndexerDataType,
  type EventIndexer,
  type BlockIndexer,
  type TxIndexer,
} from "../src/index";
import { sleep } from "../src/utils/sleep";
import { TEST_HTTP_URL, TEST_WS_URL } from "./consts";

async function testIndexer(endpointType: EndpointType, ms: number) {
  let firstBlockHeight = 0;
  let gotEvent = false;
  let gotEvent2 = false;
  let gotBlock = false;
  let gotTx = false;
  let gotHeightMatch = false;

  class BasicPersister implements Persister {
    public async getUnprocessedBlockRanges(): Promise<BlockRange[]> {
      return [];
    }

    public async persistBlock(blockHeight: number): Promise<void> {
      gotHeightMatch = gotHeightMatch || blockHeight === firstBlockHeight;
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

    private async eventIndexer2({}: EventIndexer) {
      gotEvent2 = true;
    }

    private async blockIndexer({ blockHeight }: BlockIndexer) {
      if (firstBlockHeight === 0) {
        firstBlockHeight = blockHeight;
      }

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
          indexer: this.eventIndexer2.bind(this),
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

  const retrier = createExpBackoffRetrier({
    initialInterval: 1000,
    expFactor: 2,
    maxInterval: 60000,
    jitter: 1000,
  });

  const indexer = await createIndexer({
    harness: {
      indexers: [new BasicIndexer()],
      retrier,
      type: endpointType,
      wsUrl: TEST_WS_URL,
      httpUrl: TEST_HTTP_URL,
    },
    minLogLevel: "trace",
  });

  // Start the indexer
  await indexer.start();

  expect(indexer.isSubscriptionClientConnected()).toBe(true);

  await sleep(ms);

  // Destroy the indexer
  await indexer.destroy();

  expect(gotBlock).toBe(true);
  expect(gotTx).toBe(true);
  expect(gotEvent).toBe(true);
  expect(gotEvent2).toBe(true);
  expect(gotHeightMatch).toBe(true);
}

test("Successful event, transaction, and block WebSocket indexer", async () => {
  await testIndexer("WEBSOCKET", 20000);
}, 30000);

test("Successful event, transaction, and block HTTP indexer", async () => {
  await testIndexer("HTTP_POLL", 20000);
}, 30000);
