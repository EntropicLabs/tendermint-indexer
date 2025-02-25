import {
  drizzle,
  NodePgQueryResultHKT,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import { asc, eq, ExtractTablesWithRelations, inArray } from "drizzle-orm";
import { Client } from "pg";
import { CometHttpClient } from "../clients";
import { BlockRange } from "../types/BlockRange";
import logger from "./logger";
import { Persister } from "./persister";
import { createErrorRetrier, ErrorRetrier, Retrier } from "./retry";
import getMissingRanges from "../utils/getMissingRanges";
import mergeRanges from "../utils/mergeRanges";
import {
  integer,
  pgTable,
  PgTransaction,
  PgTransactionConfig,
  serial,
} from "drizzle-orm/pg-core";
import { sleep } from "../utils/sleep";

const GET_DB_CLIENT_DELAY_MS = 100;
type PostgresTransaction = PgTransaction<
  NodePgQueryResultHKT,
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;

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
   * Triggers a retry on database transaction failures
   */
  private errorRetrier: ErrorRetrier;
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
  private db: NodePgDatabase;
  /**
   * Drizzle schema for the table storing processed block height records
   */
  private blockHeightSchema;
  /**
   * Optional min block height. If defined, the persister won't
   * consider any block with smaller heights as unprocessed blocks.
   */
  private minBlockHeight: number | undefined;

  /**
   * @param connectionUrl PostgreSQL connection URL for database
   * @param retrier  Triggers a reconnect on database disconnects
   * @param httpClient  HTTP client used to get RPC info
   * @param blockHeightTableName Table name defined in Drizzle schema
   * @param minBlockHeight Optional minimum block height
   */
  constructor(
    connectionUrl: string,
    retrier: Retrier,
    httpClient: CometHttpClient,
    blockHeightTableName: string,
    minBlockHeight?: number
  ) {
    this.httpClient = httpClient;
    this.retrier = retrier;
    this.errorRetrier = createErrorRetrier(this.retrier);
    this.connectionUrl = connectionUrl;
    this.client = new Client({
      connectionString: connectionUrl,
    });
    this.db = drizzle(this.client);
    this.blockHeightSchema = pgTable(blockHeightTableName, {
      id: serial("id").primaryKey(),
      startBlockHeight: integer("startBlockHeight").notNull(),
      endBlockHeight: integer("endBlockHeight").notNull(),
    });
    this.minBlockHeight = minBlockHeight;
  }

  public isConnected() {
    return this.isDbConnected;
  }

  /**
   * Disconnects from the Postgres Database
   */
  public async disconnect() {
    this.shouldAttemptReconnect = false;
    await this.client.end();
  }

  /**
   * Get the DB client
   * @returns A connected node-postgres client
   */
  public async getConnectedClient() {
    while (!this.isDbConnected) {
      await sleep(GET_DB_CLIENT_DELAY_MS);
    }

    return this.client;
  }

  /**
   * Connects to the Postgres database and retries on failure or connection drop
   */
  public async connect() {
    await this.retrier.wrap(
      async (success, retry) => {
        const didFail = await this.client.connect().catch(async (error) => {
          await retry(error);
          return true;
        });

        if (didFail) {
          // Close this thread since failed on a previous attempt
          return;
        }

        await success();
        this.isDbConnected = true;
        this.db = drizzle(this.client);

        logger.info("Connected to database");

        this.client.on("error", async (err) => {
          logger.warn(`Database error: ${err}`);
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
    return await this.retrier.wrap(async (success, retry) => {
      const results = await this.db
        .select()
        .from(this.blockHeightSchema)
        .orderBy(this.blockHeightSchema.startBlockHeight)
        .catch(async (error) => {
          logger.error(`Error in getProcessedBlockRanges(): ${error}`);
          return await retry(error);
        });

      await success();
      return results;
    });
  }

  /**
   * Runs a Postgres transaction and retries on error
   * @param tx Reference to the Postgres transaction object
   * @param callback Callback for Postgres transaction logic
   * @returns Results from Postgres transaction
   */
  private async retryTransaction<T>(
    callback: (tx: PostgresTransaction) => Promise<T>,
    transactionConfig: PgTransactionConfig
  ): Promise<T> {
    return await this.errorRetrier.wrap(
      async () => {
        return await this.db.transaction(async (tx) => {
          try {
            return await callback(tx);
          } catch (error) {
            /**
             * Throws an error, which will be caught by the transaction, trigger a rollback,
             * and throw another error caught by the error retrier to retry the transaction.
             */
            logger.error(
              `Error in drizzle postgres persister transaction: ${error}`
            );
            return tx.rollback();
          }
        }, transactionConfig);
      },
      {
        onFailedAttempt: async (error, attempt) => {
          logger.error(
            `Failed drizzle postgres persister transaction on attempt ${attempt}: ${error}`
          );
        },
        onFailedLastAttempt: async (error, attempt) => {
          logger.error(
            `Failed drizzle postgres persister transaction on final attempt ${attempt}: ${error}`
          );
        },
      }
    );
  }

  /**
   * Gets all the previously unprocessed block ranges for historical backfilling
   * @returns A list of all unprocessed block ranges, sorted by startBlockHeight ascending
   */
  public async getUnprocessedBlockRanges(): Promise<BlockRange[]> {
    await this.mergeBlockRanges();

    const { earliestBlockHeight, latestBlockHeight } =
      await this.httpClient.getBlockHeights();

    return await this.retryTransaction(
      async (tx) => {
        const allRanges = await tx
          .select()
          .from(this.blockHeightSchema)
          .orderBy(asc(this.blockHeightSchema.startBlockHeight));

        // Only backfill if there exists at least one processed block
        if (allRanges.length === 0) {
          return [];
        }

        const minBlockHeight = Math.max(
          this.minBlockHeight || 0,
          earliestBlockHeight
        );

        /**
         * Set the max block height to the latest processed block height as opposed to the
         * latest block height saved by the RPC node. This prevents the backfiller
         * from indexing the same block as the indexer in case the indexer
         * has a network delay.
         */
        const maxBlockHeight = Math.min(
          latestBlockHeight,
          allRanges[allRanges.length - 1].endBlockHeight
        );

        return getMissingRanges(minBlockHeight, maxBlockHeight, allRanges);
      },
      /**
       * Ensure that any block ranges read are committed and prevent dirty reads
       */
      {
        isolationLevel: "read committed",
        accessMode: "read only",
      }
    );
  }

  /**
   * Records a block as being indexed
   * @param blockHeight Block height
   */
  public async persistBlock(blockHeight: number): Promise<void> {
    return await this.retryTransaction(
      async (tx) => {
        // Try updating startBlockHeight of existing record
        let result = await tx
          .update(this.blockHeightSchema)
          .set({ startBlockHeight: blockHeight })
          .where(eq(this.blockHeightSchema.startBlockHeight, blockHeight + 1))
          .returning();

        if (result.length > 0) {
          return;
        }

        // Try updating endBlockHeight of existing record
        result = await tx
          .update(this.blockHeightSchema)
          .set({ endBlockHeight: blockHeight })
          .where(eq(this.blockHeightSchema.endBlockHeight, blockHeight - 1))
          .returning();

        if (result.length > 0) {
          return;
        }

        // If record doesn't exist, create a new block height record
        await tx.insert(this.blockHeightSchema).values({
          startBlockHeight: blockHeight,
          endBlockHeight: blockHeight,
        });
      },
      /**
       * Run transaction with read committed to only update committed ranges
       * and prevent dirty reads
       **/
      {
        isolationLevel: "read committed",
        accessMode: "read write",
      }
    );
  }

  /**
   * Merge all overlapping block ranges in the database
   *
   * @returns A list of all block ranges, post-merge
   */
  private async mergeBlockRanges(): Promise<void> {
    return await this.retryTransaction(
      async (tx) => {
        const allRanges = await tx
          .select()
          .from(this.blockHeightSchema)
          .orderBy(asc(this.blockHeightSchema.startBlockHeight));

        const { rangesToDelete, rangesToUpdate } = mergeRanges(allRanges);

        if (rangesToDelete.length > 0) {
          await tx
            .delete(this.blockHeightSchema)
            .where(inArray(this.blockHeightSchema.id, rangesToDelete));
        }

        for (const update of rangesToUpdate) {
          await tx
            .update(this.blockHeightSchema)
            .set(update)
            .where(eq(this.blockHeightSchema.id, update.id));
        }

        rangesToUpdate.sort((a, b) => a.startBlockHeight - b.startBlockHeight);
      },
      /**
       * Since all ranges are fetched initially
       * and then updated/deleted, serializable prevents cases where the backfiller
       * calculates merged ranges, the indexer updates a range, and then the backfiller
       * erases that range.
       */
      {
        isolationLevel: "serializable",
        accessMode: "read write",
      }
    );
  }
}
