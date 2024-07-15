import type { AddEventFunction } from "../types/AddEventFunction";
import type { Retrier } from "../modules/retry";
import { sleep } from "../utils/sleep";
import { Client } from "./client";
import logger from "../modules/logger";
import { CometHttpClient } from "./cometHttpClient";

/**
 * Default HTTP polling delay in milliseconds
 */
const HTTP_POLL_DELAY_MS = 2000;

/**
 * Sets up a CometBFT HTTP poll connection to query block information
 */
export class CometHttpPollClient extends Client {
  private pollIntervalMs: number;
  private endpoint: string;
  private httpClient: CometHttpClient;

  /**
   * @param httpClient CometHTTPClient used to query blockchain status
   * @param endpoint HTTP endpoint for polling
   * @param retrier Retrier for retrying HTTP calls
   * @param pollIntervalMs Polling interval in milliseconds
   * @param addEvent Optional callback for recording new block or connection events
   */
  constructor(
    httpClient: CometHttpClient,
    endpoint: string,
    retrier: Retrier,
    pollIntervalMs: number,
    addEvent?: AddEventFunction
  ) {
    super(retrier, addEvent);
    this.httpClient = httpClient;
    this.pollIntervalMs = pollIntervalMs;
    this.endpoint = endpoint;
  }

  /**
   * Create a new CometHttpClient
   * @param endpoint HTTP endpoint for polling
   * @param retrier Retrier for retrying HTTP calls
   * @param addEvent Polling interval in milliseconds
   * @param pollIntervalMs Optional callback for recording new block or connection events
   * @returns CometHttpClient
   */
  static async create(
    endpoint: string,
    retrier: Retrier,
    addEvent?: AddEventFunction,
    pollIntervalMs?: number
  ) {
    const httpClient = await CometHttpClient.create(endpoint, retrier);
    return new CometHttpPollClient(
      httpClient,
      endpoint,
      retrier,
      pollIntervalMs || HTTP_POLL_DELAY_MS,
      addEvent
    );
  }

  /**
   * Connect to HTTP poll client and retry on error
   */
  protected async connect() {
    const { earliestBlockHeight, latestBlockHeight } =
      await this.httpClient.getBlockHeights();

    // If we need to start from a specific height, check if the RPC has that height.
    if (this.currentHeight) {
      if (earliestBlockHeight && earliestBlockHeight > this.currentHeight) {
        throw new Error(
          `Requested start height ${this.currentHeight} out of range [${earliestBlockHeight}, ${latestBlockHeight}]`
        );
      }
    } else {
      this.currentHeight = latestBlockHeight;
    }

    logger.info(`Connected to ${this.endpoint}`);

    super.connect();
  }

  /**
   * Closes HTTP Polling connection
   */
  protected async disconnect(): Promise<void> {
    await super.disconnect();
  }

  /**
   * Start listening for new block events
   */
  protected async doListen() {
    while (this.isConnected) {
      if (this.currentHeight == null)
        throw new Error("Current height is not set");

      // Poll current block heights
      const { latestBlockHeight } = await this.httpClient.getBlockHeights();

      // Add all blocks up to the latest block available
      for (
        let blockHeightToAdd = this.currentHeight;
        blockHeightToAdd <= latestBlockHeight;
        blockHeightToAdd++
      ) {
        this.addEvent?.({
          blockHeight: blockHeightToAdd,
        });
        this.currentHeight = blockHeightToAdd;
      }
      await sleep(this.pollIntervalMs);
    }
  }
}
