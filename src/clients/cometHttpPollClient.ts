import type { ParseEventsFunction } from "../types/ParseEventsFunction";
import type { Retrier } from "../modules/retry";
import { sleep } from "../utils/sleep";
import { Client } from "./client";
import logger from "../modules/logger";
import { CometHttpClient } from "./cometHttpClient";

const HTTP_POLL_DELAY_MS = 2000;

/**
 * Sets up a CometBFT HTTP poll connection to query block information
 */
export class CometHttpPollClient extends Client {
  private pollInterval: number;
  private endpoint: string;
  private httpClient: CometHttpClient;

  constructor(
    httpClient: CometHttpClient,
    endpoint: string,
    retrier: Retrier,
    pollInterval: number,
    parseEvents?: ParseEventsFunction
  ) {
    super(retrier, parseEvents);
    this.httpClient = httpClient;
    this.pollInterval = pollInterval;
    this.endpoint = endpoint;
  }

  static async create(
    endpoint: string,
    retrier: Retrier,
    parseEvents?: ParseEventsFunction,
    pollInterval?: number
  ) {
    const httpClient = await CometHttpClient.create(endpoint, retrier);
    return new CometHttpPollClient(
      httpClient,
      endpoint,
      retrier,
      pollInterval || HTTP_POLL_DELAY_MS,
      parseEvents
    );
  }

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

  protected async disconnect(): Promise<void> {
    await super.disconnect();
  }

  protected async doListen() {
    if (!this.currentHeight) throw new Error("Current height is not set");
    while (this.isConnected) {
      this.parseEvents?.({
        blockHeight: this.currentHeight,
      });
      await sleep(this.pollInterval);
      this.currentHeight++;
    }
  }
}
