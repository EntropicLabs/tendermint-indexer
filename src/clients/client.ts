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

  protected constructor(
    retrier: Retrier,
    addEvent?: AddEventFunction,
    startHeight?: number
  ) {
    this.retrier = retrier;
    this.currentHeight = startHeight ?? null;
    this.addEvent = addEvent ?? null;
  }

  protected async connect(): Promise<void> {
    this.isConnected = true;
    this.addEvent?.({ isStart: true });
  }

  protected async disconnect(): Promise<void> {
    this.isConnected = false;
    this.addEvent?.({ isStart: false });
  }

  public async destroy(): Promise<void> {
    await this.disconnect();
  }

  protected abstract doListen(): Promise<void>;

  /**
   * Connects to the network client and starts listening for new block events
   */
  public async listen(): Promise<void> {
    return this.retrier.wrap(
      async (success, retry) => {
        if (!this.isConnected) {
          await this.connect()
            .catch(async (error) => {
              await retry(error);
            })
            .then(() => {
              success();
            });
        }

        this.doListen().catch(async (error) => {
          await retry(error);
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
