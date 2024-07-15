import { HttpClient, Tendermint37Client } from "@cosmjs/tendermint-rpc";
import flattenEvent from "../utils/flattenEvent";
import type { ErrorRetrier, Retrier } from "../modules/retry";
import { createErrorRetrier } from "../modules/retry";
import logger from "../modules/logger";
import type { BlockData } from "../types/BlockData";

/**
 * Sets up a CometBFT HTTP connection to query block information
 */
export class CometHttpClient {
  /**
   * Tendermint client used to make HTTP RPC calls
   */
  private readonly tmClient: Tendermint37Client;
  /**
   * Error retrier that wraps around HTTP RPC calls
   */
  private readonly errorRetrier: ErrorRetrier;

  constructor(tmClient: Tendermint37Client, retrier: Retrier) {
    this.tmClient = tmClient;
    this.errorRetrier = createErrorRetrier(retrier);
  }

  static async create(endpoint: string, retrier: Retrier) {
    const rpcClient = new HttpClient(endpoint);
    const tmClient = await Tendermint37Client.create(rpcClient);
    return new CometHttpClient(tmClient, retrier);
  }

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
          logger.warn(`getBlockData() failed attempt ${attempt}: ${error}`);
        },
        onFailedLastAttempt: () => {
          logger.error("getBlockData(): Max retries exceeded, aborting...");
        },
      }
    );
  }

  public async getBlockTime(height: number) {
    return this.errorRetrier.wrap(
      async () => {
        const { block } = await this.tmClient.block(height);
        return block.header.time;
      },
      {
        onFailedAttempt: async (error, attempt) => {
          logger.warn(`getBlockTime() failed attempt ${attempt}: ${error}`);
        },
        onFailedLastAttempt: () => {
          logger.error("getBlockTime(): Max retries exceeded, aborting...");
        },
      }
    );
  }

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
