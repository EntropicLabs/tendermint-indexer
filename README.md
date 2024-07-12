# Tendermint Indexer

A framework for setting up data indexers for [Tendermint RPC nodes](https://docs.tendermint.com/v0.37/rpc/#/).

## Indexer Setup

First, install dependencies:

```bash
bun add tendermint-indexer
```

Then, setup a basic indexer and start running it!

```typescript
// index.ts
import { type BlockRange, Persister, Indexer, type Subscription, createIndexer, createExpBackoffRetrier, EndpointType, IndexerDataType, type EventIndexer, type BlockIndexer } from "tendermint-indexer";

class BasicPersister implements Persister {
  public async getUnprocessedBlockRanges(): Promise<BlockRange[]> {
    // TODO: Return all recorded block heights from the database
    return [{startBlockHeight: 1, endBlockHeight: 100}]
  }

  public async persistBlock(blockHeight: number): Promise<void> {
    // TODO: Record blockHeight as being indexed in a database
  }
}

class BasicIndexer implements Indexer {
persister: BasicPersister;

  constructor() {
    this.persister = new BasicPersister();
  }

  private async indexer1({
    blockHeight,
    eventAttributes,
    eventType,
  } : EventIndexer) {
    // TODO: Replace with your own indexing logic!
    console.log(blockHeight);
    console.log(eventAttributes);
    console.log(eventType);
  }

  private async indexer2({
    block,
    blockHeight,
    blockResults,
  } : BlockIndexer) {
    console.log(block);
    console.log(blockHeight);
    console.log(blockResults)
  }

  public subscriptions(): Subscription[] {
    return [
      {
        filter: {
          eventType: {
            matches: [
              "transfer",
              "mint",
            ],
            contains: [
              "wasm-unstake"
            ]
          },
        },
        indexer: this.indexer1.bind(this),
        type: IndexerDataType.EVENT,
      },
      {
        indexer: this.indexer2.bind(this),
        type: IndexerDataType.BLOCK,
      }
    ];
  }

  public async destroy(): Promise<void> {
    // TODO: handle destroy logic
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
    type: EndpointType.WEBSOCKET,
    wsUrl: "wss://test-rpc-kujira.mintthemoon.xyz/websocket", // TODO: Replace with your RPC node websocket url
    httpUrl: "https://test-rpc-kujira.mintthemoon.xyz", // TODO: Replace with your RPC HTTP node url
  },
  minLogLevel: "trace", // See pino log levels (https://github.com/pinojs/pino/blob/main/docs/api.md#levels) for more options
});

// Start the indexer
await indexer.start();

// Get the indexer status
console.log(
  "Is Websocket connection alive:",
  indexer.isSubscriptionClientConnected(),
);

// Destroy the indexer
await indexer.destroy();
```

## Backfiller Setup

There is a backfiller available to index old blocks. To set this up, follow the `Indexer Setup` and then define a backfiller as shown:

```typescript
// backfill.ts
import { createBackfiller, createExpBackoffRetrier, BackfillOrder } from "tendermint-indexer";

const singleIndexer = new BasicIndexer();

const backfiller = await createBackfiller({
  harness: {
    indexer: singleIndexer,
    retrier,
    httpUrl: "https://test-rpc-kujira.mintthemoon.xyz", // Replace with your RPC HTTP node url
  },
  backfillSetup: {
    backfillOrder: BackfillOrder.ASCENDING,
  },
});

await backfiller.start();
```

The backfiller will process blocks in descending order from largest block height or smallest block height, in an unordered, parallelized manner, or process blocks specified by block height.

## How does the Indexer work?

`tendermint-indexer` takes as input a `WebSocket` or `HTTP Polling` connection type, a list of `Indexers`, and a `Retrier`. Then, performs the following steps:

1. Gets notified of new blocks through the `WebSocket` or `HTTP Polling` connection.
2. Adds blocks in increasing order of block height to a queue.
3. Processes each block from the queue and passes subscribed block, transaction, or event data to each `Indexer`.
4. After all block data for a specific height is passed to an `Indexer`, inform the `Indexer`'s `Persister`, which is a single source of truth on which blocks have been indexed.
5. In case of network failure or errors, employ the `Retrier` to retry indexing.

This guarantees that `tendermint-indexer` achieves **exactly-once semantics**, can **recover** from network failure, and delivers block data in **increasing order** of block height.

The backfiller works in a similar way, but relies on an `Indexer`'s `Persister` to index and record the unprocessed blocks.
