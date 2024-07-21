import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import {
  integer,
  pgTable,
  serial,
} from "drizzle-orm/pg-core";
import { CometHttpClient } from "../clients";
import { BlockRange } from "../types/BlockRange";
import logger from "./logger";
import { Persister } from "./persister";
import { Retrier } from "./retry";

/**
 * Defines a buffer of blocks that may be in the processes of being indexed
 * by a real-time indexer and should be avoided by the historical backfiller
 * to prevent double indexing.
 */
const DEFAULT_LATEST_BLOCK_BUFFER = 20;

/**
 * A Drizzle PostgreSQL persister that stores inclusive ranges of indexed blocks' heights.
 */
export class PostgresPersister implements Persister {
  /**
   * HTTP client used to get RPC info
   */
  private httpClient: CometHttpClient;
  /**
   * Triggers a reconnect on database disconnects
   */
  private retrier: Retrier;
  /**
   * Reference to pg database connection
   */
  private client: Client;
  private connectionUrl: string;
  /**
   * If set to true, attempt a reconnect on database disconnect
   */
  private shouldAttemptReconnect = true;
  private isDbConnected = false;
  public db: NodePgDatabase;
  private migrationsFolderPath: string;
  /**
   * Number of blocks before the latest block height to ignore when backfilling
   */
  private blockBuffer: number;
  /**
   * Drizzle schema for the table storing processed block height records
   */
  private blockHeightSchema;

  constructor(
    connectionUrl: string,
    retrier: Retrier,
    httpClient: CometHttpClient,
    migrationsFolderPath: string,
    blockBuffer = DEFAULT_LATEST_BLOCK_BUFFER,
    blockHeightTableName: string
  ) {
    this.httpClient = httpClient;
    this.retrier = retrier;
    this.connectionUrl = connectionUrl;
    this.client = new Client({
      connectionString: connectionUrl,
    });
    this.db = drizzle(this.client);
    this.migrationsFolderPath = migrationsFolderPath;
    this.blockBuffer = blockBuffer;
    this.blockHeightSchema = pgTable(blockHeightTableName, {
      id: serial("id").primaryKey(),
      startBlockHeight: integer("startBlockHeight").notNull(),
      endBlockHeight: integer("endBlockHeight").notNull(),
    });
  }

  public isConnected() {
    return this.isDbConnected;
  }

  /**
   * Initializes the database
   */
  async init(): Promise<void> {
    await this.connect();
    await migrate(this.db, { migrationsFolder: this.migrationsFolderPath });
  }

  /**
   * Disconnects from the Postgres Database
   */
  public async disconnect() {
    this.shouldAttemptReconnect = false;
    await this.client.end();
  }

  /**
   * Connects to the Postgres database and retries on failure or connection drop
   */
  public async connect() {
    await this.retrier.wrap(
      async (success, retry) => {
        await this.client
          .connect()
          .catch(async (error) => {
            await retry(error);
          })
          .then(() => {
            success();
          });

        this.isDbConnected = true;
        this.db = drizzle(this.client);

        logger.info("Connection to database");

        this.client.on("error", async (err) => {
          logger.warn("Database error", err);
          this.client.end();
        });

        this.client.on("end", async () => {
          this.isDbConnected = false;
          logger.warn(`Disconnected from the database`);
          if (this.shouldAttemptReconnect) await retry(undefined);
        });
      },
      {
        onFailedAttempt: (error, attempt) => {
          this.isDbConnected = false;
          logger.error(
            `Failed to connect to database on attempt ${attempt}: ${error}`
          );
          this.client = new Client({
            connectionString: this.connectionUrl,
          });
        },
        onFailedLastAttempt: (error, attempt) => {
          this.isDbConnected = false;
          logger.fatal(
            `Failed to connect to database on attempt ${attempt}: ${error}. Aborting...`
          );
        },
      }
    );
  }

  /**
   * Gets all the previously processed block ranges
   * @returns A list of all processed block ranges, sorted by startBlockHeight ascending
   */
  async getProcessedBlockRanges(): Promise<(BlockRange & { id: number })[]> {
    const allRanges = await this.db.select().from(this.blockHeightSchema);
    allRanges.sort((a, b) => a.startBlockHeight - b.startBlockHeight);

    return allRanges;
  }

  /**
   * Gets all the previously unprocessed block ranges
   * @returns A list of all unprocessed block ranges, sorted by startBlockHeight ascending
   */
  public async getUnprocessedBlockRanges(): Promise<BlockRange[]> {
    const blockRanges = await this.getProcessedBlockRanges();
    const { earliestBlockHeight, latestBlockHeight } =
      await this.httpClient.getBlockHeights();
    let minBlockHeight = earliestBlockHeight;
    const maxBlockHeight = latestBlockHeight - this.blockBuffer;
    // Remove all block ranges that are outside the earliest and latest block height saved by the HTTP RPC node
    const boundedBlockRanges = blockRanges
      .map(({ startBlockHeight, endBlockHeight }) => {
        if (
          endBlockHeight < minBlockHeight ||
          startBlockHeight > maxBlockHeight
        ) {
          return null;
        }
        return {
          startBlockHeight: Math.max(minBlockHeight, startBlockHeight),
          endBlockHeight: Math.min(maxBlockHeight, endBlockHeight),
        };
      })
      .filter((range) => range != null);

    const unprocessedBlockRanges: BlockRange[] = [];
    for (const { startBlockHeight, endBlockHeight } of boundedBlockRanges) {
      if (
        !(
          minBlockHeight <= startBlockHeight &&
          startBlockHeight <= maxBlockHeight &&
          minBlockHeight <= endBlockHeight &&
          endBlockHeight <= maxBlockHeight
        )
      ) {
        throw new Error(
          `Block ranges ${startBlockHeight}, ${endBlockHeight} outside of range ${minBlockHeight}, ${maxBlockHeight}`
        );
      }
      // Current and previous block range are contigous
      if (startBlockHeight == minBlockHeight) {
        minBlockHeight = endBlockHeight + 1;
        continue;
      }
      unprocessedBlockRanges.push({
        startBlockHeight: minBlockHeight,
        endBlockHeight: startBlockHeight - 1,
      });
      minBlockHeight = endBlockHeight + 1;
    }
    if (minBlockHeight <= maxBlockHeight) {
      unprocessedBlockRanges.push({
        startBlockHeight: minBlockHeight,
        endBlockHeight: maxBlockHeight,
      });
    }
    return unprocessedBlockRanges;
  }

  /**
   * Records a block as being indexed
   * @param blockHeight Block height
   */
  public async persistBlock(blockHeight: number): Promise<void> {
    const ranges = await this.mergeBlockRanges();
    // Check if the block would be a continuation of an existing range
    const existingRange = ranges.find(
      (range) =>
        range.endBlockHeight === blockHeight - 1 ||
        range.startBlockHeight === blockHeight + 1
    );
    // Update continuation range, or create a new range
    if (existingRange) {
      if (existingRange.endBlockHeight === blockHeight - 1) {
        await this.db
          .update(this.blockHeightSchema)
          .set({ endBlockHeight: blockHeight })
          .where(eq(this.blockHeightSchema.id, existingRange.id));
      } else {
        await this.db
          .update(this.blockHeightSchema)
          .set({ startBlockHeight: blockHeight })
          .where(eq(this.blockHeightSchema.id, existingRange.id));
      }
    } else {
      await this.db
        .insert(this.blockHeightSchema)
        .values({ startBlockHeight: blockHeight, endBlockHeight: blockHeight });
    }
  }

  /**
   * Merge all overlapping block ranges in the database
   *
   * @returns A list of all block ranges, post-merge
   */
  private async mergeBlockRanges(): Promise<(BlockRange & { id: number })[]> {
    const allRanges = await this.getProcessedBlockRanges();
    if (allRanges.length === 0) return [];

    type MergedRange = BlockRange & { ids: number[] };
    const mergedRanges: MergedRange[] = [];
    let currentRange: MergedRange = { ...allRanges[0], ids: [allRanges[0].id] };
    for (let i = 1; i < allRanges.length; i++) {
      const nextRange = allRanges[i];
      // The ranges overlap if the end of the current range is >= to the start of the next range
      if (currentRange.endBlockHeight + 1 >= nextRange.startBlockHeight) {
        // Merge the ranges
        currentRange.endBlockHeight = Math.max(
          currentRange.endBlockHeight,
          nextRange.endBlockHeight
        );
        currentRange.ids.push(nextRange.id);
      } else {
        // No change, push the current range.
        mergedRanges.push(currentRange);
        currentRange = { ...nextRange, ids: [nextRange.id] };
      }
    }
    mergedRanges.push(currentRange);

    // Flatten all the ranges
    const rangesToDelete = mergedRanges
      .map((range) => {
        let [_, ...rest] = range.ids;
        return rest;
      })
      .flat();
    const ranges = await this.db.transaction(async (tx) => {
      if (rangesToDelete.length > 0) {
        await tx
          .delete(this.blockHeightSchema)
          .where(inArray(this.blockHeightSchema.id, rangesToDelete));
      }

      const updates = mergedRanges.map((range) => {
        const { ids, ...rest } = range;
        return {
          id: ids[0],
          ...rest,
        };
      });

      let ranges: (BlockRange & { id: number })[] = [];
      for (const update of updates) {
        const range = await tx
          .update(this.blockHeightSchema)
          .set(update)
          .where(eq(this.blockHeightSchema.id, update.id))
          .returning();
        ranges = ranges.concat(range);
      }

      return ranges;
    });
    ranges.sort((a, b) => a.startBlockHeight - b.startBlockHeight);

    return ranges;
  }
}
