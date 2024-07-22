# Tendermint Indexer

A framework for setting up data indexers for Tendermint RPC nodes.

## Indexer Setup

First, install dependencies:

```bash
bun add tendermint-indexer
```

Then, setup a basic indexer and start running it!

```typescript
// index.ts
import {
  Indexer,
  type Subscription,
  createIndexer,
  EndpointType,
  IndexerDataType,
  type EventIndexer,
} from "@entropic-labs/tendermint-indexer";

class BasicIndexer implements Indexer {
  private async indexer({
    blockHeight,
    eventAttributes,
    eventType,
  }: EventIndexer) {
    // Replace with your own indexing logic!
    console.log(blockHeight);
    console.log(eventAttributes);
    console.log(eventType);
  }

  public subscriptions(): Subscription[] {
    return [
      {
        indexer: this.indexer.bind(this),
        type: IndexerDataType.EVENT,
      },
    ];
  }

  public async destroy(): Promise<void> {}
}

const indexer = await createIndexer({
  harness: {
    indexers: [new BasicIndexer()],
    type: EndpointType.WEBSOCKET,
    // Replace with your RPC node websocket url
    wsUrl: "wss://test-rpc-kujira.mintthemoon.xyz/websocket",
    // Replace with your RPC HTTP node url
    httpUrl: "https://test-rpc-kujira.mintthemoon.xyz",
  },
  // See pino log levels (https://github.com/pinojs/pino/blob/main/docs/api.md#levels) for more options
  minLogLevel: "trace",
});

// Start the indexer
await indexer.start();

// Get the indexer status
console.log(
  "Is Websocket connection alive:",
  indexer.isSubscriptionClientConnected()
);

// Destroy the indexer
await indexer.destroy();
```

## Backfiller Setup

There is a backfiller available to index old blocks. To set this up, follow the `Indexer Setup` and then define a backfiller as shown:

```typescript
// backfill.ts
import { createBackfiller, BackfillOrder } from "@entropic-labs/tendermint-indexer";

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

The backfiller will process blocks in descending order from largest block height or smallest block height, in an unordered, concurrent manner, or process blocks specified by block height.

## Setup a Retrier

A retrier wraps around network calls and connections and retries them on failure. It can also be triggered manually through code. By default, an exponential backoff retrier is used for indexing and backfilling. To specify a custom retrier:

```typescript
import { createRetrier, createExpBackoffRetrier } from "@entropic-labs/tendermint-indexer";

// Basic retrier that retries 3 times, each with a 500 ms delay
const retrier = createRetrier(
  {
    maxRetries: 3,
  },
  () => 500
);

// An exponential backoff retrier
const expRetrier = createExpBackoffRetrier({
  initialInterval: 1000,
  expFactor: 2,
  jitter: 1000,
  maxRetries: 3,
});

const indexerWithCustomRetrier = await createIndexer({
  harness: {
    httpUrl: "https://test-rpc-kujira.mintthemoon.xyz",
    indexers: [new BasicIndexer()],
    retrier: retrier,
    type: EndpointType.WEBSOCKET,
    wsUrl: "wss://test-rpc-kujira.mintthemoon.xyz/websocket",
  },
  minLogLevel: "trace",
});

const backfillerWithCustomRetrier = await createBackfiller({
  harness: {
    indexer: new BasicIndexer(),
    retrier: expRetrier,
    httpUrl: "https://test-rpc-kujira.mintthemoon.xyz",
  },
  backfillSetup: {
    backfillOrder: BackfillOrder.ASCENDING,
  },
});
```

An error retrier can also be created, whcih automatically retries when an error is thrown.

```typescript
import { createErrorRetrier } from "@entropic-labs/tendermint-indexer";

const errorRetrier = createErrorRetrier(retrier);
```

## Add a Persister

A persister is a single source of truth on which blocks have been indexed. Real-time indexers do not reqire a persister, but backfilling indexers do require persisters to know which blocks are unprocessed.

To setup an indexer with a persister:

```typescript
import { PersistantIndexer, Persister } from "@entropic-labs/tendermint-indexer";

class BasicPersister implements Persister {
  public async getUnprocessedBlockRanges(): Promise<BlockRange[]> {
    // Implement logic for fetching unprocessed block ranges from a database
    return [];
  }

  public async persistBlock(blockHeight: number): Promise<void> {
    // Store persisted block heights in a database
  }
}

class BasicIndexer implements PersistantIndexer {
  persister: BasicPersister;

  private async indexer({
    blockHeight,
    eventAttributes,
    eventType,
  }: EventIndexer) {
    // Replace with your own indexing logic!
    console.log(blockHeight);
    console.log(eventAttributes);
    console.log(eventType);
  }

  public subscriptions(): Subscription[] {
    return [
      {
        indexer: this.indexer.bind(this),
        type: IndexerDataType.EVENT,
      },
    ];
  }

  public async destroy(): Promise<void> {}
}
```

## How does the Indexer work?

`tendermint-indexer` takes as input a `WebSocket` or `HTTP Polling` connection type, a list of `Indexers`, and a `Retrier`. Then, performs the following steps:

1. Gets notified of new blocks through the `WebSocket` or `HTTP Polling` connection.
2. Adds blocks in increasing order of block height to a queue.
3. Processes each block from the queue and passes subscribed block, transaction, or event data to each `Indexer`.
4. After all block data for a specific height is passed to an `Indexer`, inform the `Indexer`'s `Persister` (if it exists), which is a single source of truth on which blocks have been indexed.
5. In case of network failure or errors, employ the `Retrier` to retry indexing.

This guarantees that `tendermint-indexer` achieves **exactly-once semantics**, can **recover** from network failure, and delivers block data in **increasing order** of block height.

The backfiller works in a similar way, but relies on an `Indexer`'s `Persister` to index and record the unprocessed blocks.

## Provided Persisters

### Drizzle PostgreSQL persister

A PostgreSQL persister is available and requires Drizzle migration setup.The persister stores inclusive ranges of processed blocks' heights.

To setup, first install drizzle:

```bash
bun add drizzle-orm drizzle-kit 
```

Next, create a `db` folder. Create an empty `migrations` folder and a `schema.ts` file inside the folder.

```typescript
// db/schema.ts
import {
  integer,
  pgTable,
  serial,
} from "drizzle-orm/pg-core";

export const blockHeightTableName = "myBlockHeightTable";

export const blockHeight = pgTable(blockHeightTableName, {
  id: serial("id").primaryKey(),
  startBlockHeight: integer("startBlockHeight").notNull(),
  endBlockHeight: integer("endBlockHeight").notNull(),
});

// Add other schemas below
```

Then, run:

```bash
bun drizzle-kit generate
```

After, setup the persister and run the Drizzle migration:

```typescript
// index.ts
import {
  SQLPersister,
  DEFAULT_RETRIER,
  CometHttpClient,
} from "@entropic-labs/tendermint-indexer";
import { blockHeightTableName } from ".db/schema"

const httpClient = await CometHttpClient.create(
  nodeHttpUrl,
  DEFAULT_RETRIER,
);

const persister = new DrizzlePostgresPersister(
  // Replace with your PostgreSQL connection url
  "postgres://postgres:@localhost:5432/unstake",
  DEFAULT_RETRIER,
  httpClient,
  blockHeightTableName,
);

// Connect to the persister
await persister.connect();

// Automatically run a data migration
await migrate(drizzle(persister.client), {
  // Change path based on where the db folder exists
  migrationsFolder: "./db/migrations"
});

// Continue with using the persister in an indexer...
```
### Raw SQL persister

A SQL persister is available and requires a function that runs raw SQL queries in a SQL database (PostgreSQL, MySQL, etc.). The SQL persister creates a table for storing inclusive ranges of processed blocks' heights.

```typescript
import {
  SQLPersister,
  DEFAULT_RETRIER,
  CometHttpClient,
} from "@entropic-labs/tendermint-indexer";

const httpClient = await CometHttpClient.create(
  "https://test-rpc-kujira.mintthemoon.xyz",
  DEFAULT_RETRIER
);

const sqlPersister = new SQLPersister(
  async (query: string) => {
    // Implement logic for running raw SQL queries in a SQL database
    return [];
  },
  "blockHeightTableName",
  httpClient
);
// Create the SQL table if it already doesn't exist
await persister.setup();

// Continue with using the persister in an indexer...
```
## More Indexer Examples

Below are some more examples on more complex indexers.

```typescript
import {
  Indexer,
  type Subscription,
  IndexerDataType,
  type EventIndexer,
  type TxIndexer,
  type BlockIndexer,
} from "@entropic-labs/tendermint-indexer";

class ComplexIndexer implements Indexer {
  private async eventIndexer({
    blockHeight,
    eventAttributes,
    eventType,
  }: EventIndexer) {
    console.log(blockHeight);
    console.log(eventAttributes);
    console.log(eventType);
  }

  private async txIndexer({ tx, blockHeight }: TxIndexer) {
    console.log(tx);
    console.log(blockHeight);
  }

  private async blockIndexeer({
    block,
    blockHeight,
    blockResults,
  }: BlockIndexer) {
    console.log(block);
    console.log(blockHeight);
    console.log(blockResults);
  }

  public subscriptions(): Subscription[] {
    // Indexers will be called in sequential order
    return [
      {
        indexer: this.eventIndexer.bind(this),
        type: IndexerDataType.EVENT,
        filter: {
          eventType: {
            // Index an event if its type is "transfer"
            matches: ["transfer"],
            //  Index an event if its type contains "a" or "b"
            contains: ["a", "b"],
          },
        },
      },
      {
        indexer: this.txIndexer.bind(this),
        type: IndexerDataType.TX,
      },
      {
        indexer: this.blockIndexer.bind(this),
        type: IndexerDataType.BLOCK,
      },
    ];
  }

  public async destroy(): Promise<void> {}
}
```

## More Backfiller Examples

Below are some more examples on more complex backfillers.

### Backfill unprocessed blocks in a concurrent order

```typescript
import { CreateBackfillerParams } from "@entropic-labs/tendermint-indexer";

const concurrentBackfill: CreateBackfillerParams = {
  harness: {
    indexer: singleIndexer,
    retrier,
    httpUrl: "https://test-rpc-kujira.mintthemoon.xyz",
  },
  backfillSetup: {
    backfillOrder: BackfillOrder.CONCURRENT,
    numProcesses: 4,
  },
};
```

### Ascending backfill to specific block or timestamp

```typescript
import { CreateBackfillerParams, CometHttpClient } from "@entropic-labs/tendermint-indexer";

function range(start: number, end: number, step = 1) {
  return Array(Math.floor((end - start) / step) + 1)
    .fill()
    .map((_, idx) => start + idx * step);
}

function blockHeightAtTime(date: Date): Promise<number> {
  const url = `https://api.kujira.app/api/block?before=${date.toISOString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch block height: ${res.statusText}`);
  }
  const data = await res.json();
  return data.height;
}

const httpUrl = "https://kujira-rpc.nodes.defiantlabs.net/";
const httpClient = await CometHttpClient.create(httpUrl, DEFAULT_RETRIER);
const { latestBlockHeight } = await httpClient.getBlockHeights();

const startBlockHeight = blockHeightAtTime(new Date("11/01/2023"));
const blockHeightsToProcess = range(startBlockHeight, latestBlockHeight);

const specificBlockBackfill: CreateBackfillerParams = {
  harness: {
    indexer: singleIndexer,
    retrier,
    httpUrl,
  },
  backfillSetup: {
    backfillOrder: BackfillOrder.SPECIFIC,
    blockHeightsToProcess,
    shouldPersist: true,
  },
};
```

### Descending backfill to specific block or timestamp

```typescript
// Same logic as above, but reverse blockHeightsToProcess
const specificBlockBackfill: CreateBackfillerParams = {
  harness: {
    indexer: singleIndexer,
    retrier,
    httpUrl,
  },
  backfillSetup: {
    backfillOrder: BackfillOrder.SPECIFIC,
    blockHeightsToProcess: blockHeightsToProcess.reverse(),
    shouldPersist: true,
  },
};
```

### Backfill using a specific range

```typescript
// Index every 10,000 blocks
import { CreateBackfillerParams, CometHttpClient } from "@entropic-labs/tendermint-indexer";

const httpUrl = "https://kujira-rpc.nodes.defiantlabs.net/";
const httpClient = await CometHttpClient.create(httpUrl, DEFAULT_RETRIER);
const { earliestBlockHeight, latestBlockHeight } =
  await httpClient.getBlockHeights();

const startBlockHeight = blockHeightAtTime(new Date("11/01/2023"));
const blockHeightsToProcess = range(
  earliestBlockHeight,
  latestBlockHeight,
  10000
);

const specificBlockBackfill: CreateBackfillerParams = {
  harness: {
    indexer: singleIndexer,
    retrier,
    httpUrl,
  },
  backfillSetup: {
    backfillOrder: BackfillOrder.SPECIFIC,
    blockHeightsToProcess,
    shouldPersist: false,
  },
};
```
