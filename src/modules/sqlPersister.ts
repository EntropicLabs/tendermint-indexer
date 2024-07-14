import type { BlockRange } from "../types/BlockRange";
import { Persister } from "./persister";
import { CometHttpClient } from "../clients/cometHttpClient";
import { mapAndFilterNull } from "../utils/mapAndFilterNull";
import logger from "./logger";
import { isNumber } from "../utils/isNumber";

type DBJSON = { [key: string]: any };
type SQLQueryFunction = (query: string) => Promise<DBJSON[]>;

export class SQLPersister implements Persister {
  private runQuery: SQLQueryFunction;
  private blockHeightTableName: string;
  private httpClient: CometHttpClient;
  private startBlockHeight = 0;
  private prevBlockHeight = 0;

  constructor(
    runQuery: SQLQueryFunction,
    blockHeightTableName: string,
    httpClient: CometHttpClient
  ) {
    this.runQuery = runQuery;
    this.blockHeightTableName = blockHeightTableName;
    this.httpClient = httpClient;
  }

  public async setup() {
    await this
      .runQuery(`CREATE TABLE IF NOT EXISTS "${this.blockHeightTableName}" (
        "id" SERIAL PRIMARY KEY,
        "startBlockHeight" INTEGER NOT NULL,
        "endBlockHeight" INTEGER NOT NULL
      )
      `);
  }

  public async getProcessedBlockRanges(): Promise<BlockRange[]> {
    const rawProcessedBlocks = await this.runQuery(
      `SELECT * FROM "${this.blockHeightTableName}"`
    );

    const blockRanges: BlockRange[] = rawProcessedBlocks.map((block) => {
      if (
        !isNumber(block.startBlockHeight) ||
        !isNumber(block.endBlockHeight)
      ) {
        throw new Error(
          `Query returns a block with non-number height ${block.startBlockHeight}, ${block.endBlockHeight}`
        );
      }

      return {
        startBlockHeight: block.startBlockHeight,
        endBlockHeight: block.endBlockHeight,
      };
    });

    blockRanges.sort((a, b) => a.startBlockHeight - b.startBlockHeight);
    return blockRanges;
  }

  private async mergeBlockRange(toDelete: BlockRange[]) {
    logger.info("Merging the following block height records:");
    logger.info(toDelete);

    // Insert the merged record
    await this.runQuery(
      `INSERT INTO "${
        this.blockHeightTableName
      }" ("startBlockHeight","endBlockHeight") VALUES (${
        toDelete[0].startBlockHeight
      },${toDelete[toDelete.length - 1].endBlockHeight})`
    );

    // Delete the smaller ranges
    for (const {
      startBlockHeight: deleteStartBlockHeight,
      endBlockHeight: deleteEndBlockHeight,
    } of toDelete) {
      await this.runQuery(
        `DELETE FROM "${this.blockHeightTableName}" WHERE "startBlockHeight"=${deleteStartBlockHeight} AND "endBlockHeight"=${deleteEndBlockHeight}`
      );
    }
  }

  private async mergeBlockRanges() {
    const blockRecords = await this.getProcessedBlockRanges();

    if (blockRecords.length === 0) {
      return;
    }

    // Don't consider the last record since it might be in the process of being updated by the indexer
    blockRecords.pop();

    let toDelete: BlockRange[] = [];

    for (const { startBlockHeight, endBlockHeight } of blockRecords) {
      const toDeleteLength = toDelete.length;

      if (toDeleteLength === 0) {
        toDelete.push({ startBlockHeight, endBlockHeight });
        continue;
      }

      // Previous block range can be joined with the current block range
      if (
        startBlockHeight ===
        toDelete[toDeleteLength - 1].endBlockHeight + 1
      ) {
        toDelete.push({ startBlockHeight, endBlockHeight });
        continue;
      }

      if (toDeleteLength > 1) {
        await this.mergeBlockRange(toDelete);
      }
      toDelete = [{ startBlockHeight, endBlockHeight }];
    }

    if (toDelete.length > 1) {
      await this.mergeBlockRange(toDelete);
    }
  }

  /**
   * Determines blocks that weren't processed by the indexer based on block ranges
   * saved in the block height database and returns unprocessed block heights in inclusive ranges.
   */
  public async getUnprocessedBlockRanges(): Promise<BlockRange[]> {
    // Merge block ranges beforehand to reduce size of block height table
    await this.mergeBlockRanges();

    const blockRanges = await this.getProcessedBlockRanges();

    const { earliestBlockHeight, latestBlockHeight } =
      await this.httpClient.getBlockHeights();
    let minBlock = earliestBlockHeight;

    // Remove all block ranges that are outside the earliest and latest block height saved by the HTTP RPC node
    const boundedBlockRanges = mapAndFilterNull(
      blockRanges,
      ({ startBlockHeight, endBlockHeight }) => {
        if (
          endBlockHeight < earliestBlockHeight ||
          startBlockHeight > latestBlockHeight
        ) {
          return null;
        }

        return {
          startBlockHeight: Math.max(earliestBlockHeight, startBlockHeight),
          endBlockHeight: Math.min(latestBlockHeight, endBlockHeight),
        };
      }
    );

    const unprocessedBlockRanges: BlockRange[] = [];

    // Guaranteed that all earliestBlockHeight <= startBlockHeight, endBlockHeight <= latestBlockHeight
    for (const { startBlockHeight, endBlockHeight } of boundedBlockRanges) {
      if (
        !(
          earliestBlockHeight <= startBlockHeight &&
          startBlockHeight <= latestBlockHeight &&
          earliestBlockHeight <= endBlockHeight &&
          endBlockHeight <= latestBlockHeight
        )
      ) {
        throw new Error(
          `Block ranges ${startBlockHeight}, ${endBlockHeight} outside of range ${earliestBlockHeight}, ${latestBlockHeight}`
        );
      }

      if (startBlockHeight < minBlock) {
        throw new Error(
          `Overlap detected in block ranges ${startBlockHeight}, ${endBlockHeight} with block ${minBlock}`
        );
      }

      // Current and previous block range are contigous
      if (startBlockHeight == minBlock) {
        minBlock = endBlockHeight + 1;
        continue;
      }

      unprocessedBlockRanges.push({
        startBlockHeight: minBlock,
        endBlockHeight: startBlockHeight - 1,
      });

      minBlock = endBlockHeight + 1;
    }

    unprocessedBlockRanges.sort(
      (a, b) => a.startBlockHeight - b.startBlockHeight
    );

    return unprocessedBlockRanges;
  }

  private async updateMinOrMaxRecord(
    startBlockHeight: number,
    endBlockHeight: number,
    shouldUpdateMax: boolean
  ) {
    if (shouldUpdateMax) {
      await this.runQuery(`
        UPDATE "${this.blockHeightTableName}"
        SET "endBlockHeight"= GREATEST("endBlockHeight", ${endBlockHeight})
        WHERE "startBlockHeight" = ${startBlockHeight};

        INSERT INTO "${this.blockHeightTableName}" ("startBlockHeight", "endBlockHeight")
        SELECT ${startBlockHeight}, ${endBlockHeight}
        WHERE NOT EXISTS (
            SELECT 1
            FROM "${this.blockHeightTableName}"
            WHERE "startBlockHeight"=${startBlockHeight}
        );
      `);
      return;
    }

    await this.runQuery(`
        UPDATE "${this.blockHeightTableName}"
        SET "startBlockHeight"= LEAST("startBlockHeight", ${startBlockHeight})
        WHERE "endBlockHeight" = ${endBlockHeight};

        INSERT INTO "${this.blockHeightTableName}" ("startBlockHeight", "endBlockHeight")
        SELECT ${startBlockHeight}, ${endBlockHeight}
        WHERE NOT EXISTS (
            SELECT 1
            FROM "${this.blockHeightTableName}"
            WHERE "endBlockHeight"=${endBlockHeight}
        );
      `);
  }

  public async persistBlock(blockHeight: number): Promise<void> {
    if (
      this.startBlockHeight == 0 ||
      !(
        (this.startBlockHeight < blockHeight &&
          this.prevBlockHeight + 1 === blockHeight) ||
        (this.startBlockHeight > blockHeight &&
          this.prevBlockHeight - 1 === blockHeight)
      )
    ) {
      // Either this is the first time persisting a block or
      // the start of a new block range
      this.startBlockHeight = blockHeight;
      this.prevBlockHeight = blockHeight;
      await this.updateMinOrMaxRecord(blockHeight, blockHeight, true);
      return;
    }

    // Set to true if the current saved block range for an ascending backfill
    // where the endBlockHeight keeps getting updated
    const isAscendingBackfill =
      this.startBlockHeight < blockHeight &&
      this.prevBlockHeight + 1 === blockHeight;

    await this.updateMinOrMaxRecord(
      isAscendingBackfill ? this.startBlockHeight : blockHeight,
      isAscendingBackfill ? blockHeight : this.startBlockHeight,
      isAscendingBackfill
    );
    this.prevBlockHeight = blockHeight;
  }
}
