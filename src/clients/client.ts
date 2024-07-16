import logger from "../modules/logger";
import type { Retrier } from "../modules/retry";
import type { AddEventFunction } from "../types/AddEventFunction";

/**
 * Interface for a Network client that listens for new block events
 */
export abstract class Client {
  protected isConnected: boolean = false;
  protected currentHeight: number | null = null;
  protected retrier: Retrier;
  /**
   * Callback for new block or connect events
   **/
  protected addEvent: AddEventFunction | null = null;

  public get connected(): boolean {
    return this.isConnected;
  }

  public get height(): number | null {
    return this.currentHeight;
  }

  /**
   * @param retrier Retrier used for reconnecting to network client
   * @param addEvent Optional callback for recording new block or connection events
   */
  protected constructor(retrier: Retrier, addEvent?: AddEventFunction) {
    this.retrier = retrier;
    this.addEvent = addEvent ?? null;
  }

  /**
   * Connect to the network client
   */
  protected async connect(): Promise<void> {
    this.isConnected = true;
    this.addEvent?.({ isStart: true });
  }

  /**
   * Disconnect from the network client
   */
  public async disconnect(): Promise<void> {
    this.isConnected = false;
    this.addEvent?.({ isStart: false });
  }

  /**
   * Start listening for new block events
   */
  protected abstract doListen(): Promise<void>;

  /**
   * Connects to the network client and starts listening for new block events
   */
  public async listen(): Promise<void> {
    return this.retrier.wrap(
      async (success, retry) => {
        if (!this.isConnected) {
          const didFail = await this.connect().catch(async (error) => {
            await retry(error);
            return true;
          });

          if (didFail) {
            return;
          }

          await success();
        }

        this.doListen().catch(async (error) => {
          return await retry(error);
        });
      },
      {
        onFailedAttempt: (error: any) => {
          logger.error(`Trying to listen again due to client error: ${error}`);
        },
        onFailedLastAttempt: () => {
          logger.fatal("Max client retries exceeded, aborting...");
        },
      }
    );
  }
}
