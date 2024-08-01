import {
  HttpBatchClient,
  HttpClient,
  Tendermint37Client,
} from "@cosmjs/tendermint-rpc";
import flattenEvent from "../utils/flattenEvent";
import type { ErrorRetrier, Retrier } from "../modules/retry";
import { createErrorRetrier } from "../modules/retry";
import logger from "../modules/logger";
import type { BlockData } from "../types/BlockData";

/**
 * Parameters found to work well with larger backfills, but may need further
 * benchmarking/tweaking.
 */
const BATCH_DISPATCH_INTERVAL = 200;
const BATCH_SIZE_LIMIT = 20;

/**
 * Sets up a CometBFT HTTP connection to query block information
 */
export class CometHttpClient {
  private readonly tmClient: Tendermint37Client;
  private readonly errorRetrier: ErrorRetrier;

  /**
   * @param tmClient Tendermint endermint client used to make HTTP RPC calls
   * @param retrier Error retrier that wraps around HTTP RPC calls
   */
  constructor(tmClient: Tendermint37Client, retrier: Retrier) {
    this.tmClient = tmClient;
    this.errorRetrier = createErrorRetrier(retrier);
  }

  /**
   * Create a new CometHTTPClient
   * @param endpoint RPC HTTP endpoint
   * @param retrier Error retrier that wraps around HTTP RPC calls
   * @param shouldBatchRequests If true, HTTP requests will be batched
   * @returns CometHTTPClient
   */
  static async create(
    endpoint: string,
    retrier: Retrier,
    shouldBatchRequests = false
  ) {
    const rpcClient = shouldBatchRequests
      ? new HttpBatchClient(endpoint, {
          dispatchInterval: BATCH_DISPATCH_INTERVAL,
          batchSizeLimit: BATCH_SIZE_LIMIT,
        })
      : new HttpClient(endpoint);

    const tmClient = await Tendermint37Client.create(rpcClient);
    return new CometHttpClient(tmClient, retrier);
  }

  /**
   * Queries event, transaction, block header, and block results for the queried block
   * @param height Block height
   * @returns Queried block data
   */
  public async getBlockData(height: number): Promise<BlockData> {
    return this.errorRetrier.wrap(
      async () => {
        const blockResults = await this.tmClient.blockResults(height);
        const { block } = await this.tmClient.block(height);

        // Gather all events based on transaction order
        const events = blockResults.results
          .map((result) => result.events)
          .map((txEvents) => txEvents.map((event) => flattenEvent(event)))
          .reduce(
            (tmEventAccArr, currTmEventArr) =>
              tmEventAccArr.concat(currTmEventArr),
            []
          );

        return {
          block,
          blockResults,
          tx: blockResults.results,
          events,
        };
      },
      {
        onFailedAttempt: async (error, attempt) => {
          logger.warn(
            `getBlockData(${height}) failed attempt ${attempt}: ${error}`
          );
        },
        onFailedLastAttempt: (error) => {
          logger.error(
            `getBlockData(${height}): Max retries exceeded, aborting...: ${error}`
          );
        },
      }
    );
  }

  /**
   * Queries block time
   * @param height block height
   * @returns block time with nanosecond precision
   */
  public async getBlockTime(height: number) {
    return this.errorRetrier.wrap(
      async () => {
        const { block } = await this.tmClient.block(height);
        return block.header.time;
      },
      {
        onFailedAttempt: async (error, attempt) => {
          logger.warn(
            `getBlockTime(${height}) failed attempt ${attempt}: ${error}`
          );
        },
        onFailedLastAttempt: (error) => {
          logger.error(
            `getBlockTime(${height}): Max retries exceeded, aborting...: ${error}`
          );
        },
      }
    );
  }

  /**
   * Queries the earliest and latest block heights stored by an RPC node
   * @returns earliest and latest block heights
   */
  public async getBlockHeights() {
    return this.errorRetrier.wrap(
      async () => {
        const { syncInfo } = await this.tmClient.status();
        return {
          earliestBlockHeight: syncInfo.earliestBlockHeight || 1,
          latestBlockHeight: syncInfo.latestBlockHeight,
        };
      },
      {
        onFailedAttempt: async (error, attempt) => {
          logger.warn(`getBlockHeights() failed attempt ${attempt}: ${error}`);
        },
        onFailedLastAttempt: (error) => {
          logger.error(
            `getBlockHeights(): Max retries exceeded, aborting... ${error}`
          );
        },
      }
    );
  }
}
