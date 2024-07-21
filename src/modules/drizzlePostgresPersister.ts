import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { integer, pgTable, serial } from "drizzle-orm/pg-core";
import { CometHttpClient } from "../clients";
import { BlockRange, PGBlockRange } from "../types/BlockRange";
import logger from "./logger";
import { Persister } from "./persister";
import { Retrier } from "./retry";
import getMissingRanges from "../utils/getMissingRanges";
import mergeRanges from "../utils/mergeRanges";

/**
 * Defines a buffer of blocks that may be in the processes of being indexed
 * by a real-time indexer and should be avoided by the historical backfiller
 * to prevent double indexing.
 */
const DEFAULT_LATEST_BLOCK_BUFFER = 20;

/**
 * A Drizzle PostgreSQL persister that stores inclusive ranges of indexed blocks' heights.
 */
export class DrizzlePostgresPersister implements Persister {
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
    blockHeightTableName: string,
    blockBuffer = DEFAULT_LATEST_BLOCK_BUFFER,
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
    return getMissingRanges(minBlockHeight, maxBlockHeight, blockRanges);
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
  private async mergeBlockRanges(): Promise<PGBlockRange[]> {
    const allRanges = await this.getProcessedBlockRanges();
    const { rangesToDelete, rangesToUpdate } = mergeRanges(allRanges);

    await this.db.transaction(async (tx) => {
      if (rangesToDelete.length > 0) {
        await tx
          .delete(this.blockHeightSchema)
          .where(inArray(this.blockHeightSchema.id, rangesToDelete));
      }

      for (const update of rangesToUpdate) {
        await tx
          .update(this.blockHeightSchema)
          .set(update)
          .where(eq(this.blockHeightSchema.id, update.id))
          .returning();
      }
    });

    rangesToUpdate.sort((a, b) => a.startBlockHeight - b.startBlockHeight);
    return rangesToUpdate;
  }
}
