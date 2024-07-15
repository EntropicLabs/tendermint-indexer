import logger from "../modules/logger";
import type { Retrier } from "../modules/retry";
import type { ParseEventsFunction } from "../types/ParseEventsFunction";

/**
 * Interface for a Network client that listens for new block events
 */
export abstract class Client {
  protected isConnected: boolean = false;
  protected currentHeight: number | null = null;
  protected retrier: Retrier;
  protected parseEvents: ParseEventsFunction | null = null;

  public get connected(): boolean {
    return this.isConnected;
  }

  public get height(): number | null {
    return this.currentHeight;
  }

  protected constructor(retrier: Retrier, parseEvents?: ParseEventsFunction) {
    this.retrier = retrier;
    this.parseEvents = parseEvents ?? null;
  }

  protected async connect(): Promise<void> {
    this.isConnected = true;
    this.parseEvents?.({ isStart: true });
  }

  protected async disconnect(): Promise<void> {
    this.isConnected = false;
    this.parseEvents?.({ isStart: false });
  }

  public async destroy(): Promise<void> {
    await this.disconnect();
  }

  protected abstract doListen(): Promise<void>;

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
