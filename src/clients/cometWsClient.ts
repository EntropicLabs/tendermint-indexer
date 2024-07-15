import "dotenv/config";
import { WebSocket } from "ws";
import type { ParseEventsFunction } from "../types/ParseEventsFunction";
import type { Retrier } from "../modules/retry";
import { Client } from "./client";
import logger from "../modules/logger";
import getValue from "../utils/getValue";
import parseStringToInt from "../utils/parseStringToInt";
import { isWSEvent, isWSEventResult, type WSEvent } from "../types/Events";

/**
 * Sets up a CometBFT websocket connection for querying new blocks
 */
export class CometWsClient extends Client {
  private ws: WebSocket | null = null;
  private wsUrl: string;

  static async create(
    wsUrl: string,
    retrier: Retrier,
    parseEvents?: ParseEventsFunction,
    startHeight?: number
  ) {
    return new CometWsClient(wsUrl, retrier, parseEvents, startHeight);
  }

  constructor(
    wsUrl: string,
    retrier: Retrier,
    parseEvents?: ParseEventsFunction,
    startHeight?: number
  ) {
    if (startHeight)
      throw new Error("Websocket client does not support startHeight");
    super(retrier, parseEvents);
    this.wsUrl = wsUrl;
  }

  protected async connect() {
    const connectionPromise = new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      const onOpen = () => {
        logger.info(`Connected to ${this.wsUrl}`);
        this.ws?.off("open", onOpen);
        this.ws?.off("error", onOpenError);
        resolve();
      };
      const onOpenError = (error: any) => {
        this.ws?.off("open", onOpen);
        this.ws?.off("error", onOpenError);
        this.ws?.close();
        reject(new Error(`Error connecting to ${this.wsUrl}: ${error}`));
      };

      const onDisconnect = async (error: any) => {
        await this.destroyConnection();
        reject(new Error(`Disconnected from ${this.wsUrl}: ${error}`));
      };

      this.ws.on("open", onOpen);
      this.ws.on("error", onOpenError);
      this.ws.on("close", onDisconnect);
    });

    await connectionPromise;
    super.connect();
  }

  private parseMessage(data: string): WSEvent | null {
    try {
      const parsedMessage = JSON.parse(data.toString());

      if (parsedMessage == null) {
        throw new Error("Websocket data is null");
      }

      if (!isWSEvent(parsedMessage)) {
        throw new Error(`Websocket data is not of type WSEvent ${data}`);
      }

      return parsedMessage;
    } catch (error) {
      logger.error(`Error in ${this.wsUrl} parseMessage()`, error);
      return null;
    }
  }

  private sendNewBlockSubscription() {
    const subscriptionQuery = {
      jsonrpc: "2.0",
      method: "subscribe",
      id: 1,
      params: {
        query: "tm.event='NewBlock'",
      },
    };

    this.ws?.send(JSON.stringify(subscriptionQuery));
  }

  protected async doListen() {
    if (!this.ws) throw new Error("Websocket is not connected");

    const listenPromise = new Promise<void>((resolve, reject) => {
      const onError = (error: any) => {
        logger.error(`Error in ${this.wsUrl}:`, error);
        this.ws?.off("error", onError);
        this.ws?.off("message", onMessage);
        this.ws?.close();
        reject(error);
      };

      const onMessage = async (data: any) => {
        const event = this.parseMessage(data.toString());
        if (event) {
          if (!isWSEventResult(event.result)) {
            // Got a response with no event data
            return;
          }

          if (event.result.data.type === "tendermint/event/NewBlock") {
            const blockHeight = parseStringToInt(
              getValue(event.result.data.value, ["block", "header", "height"])
            );

            if (blockHeight === null) {
              logger.error("Block height is null in NewBlock");
              return;
            }

            this.currentHeight = blockHeight;
            this.parseEvents?.({
              blockHeight,
            });
          } else {
            throw new Error(
              `Unanticipated result data type ${event.result.data.type}.'`
            );
          }
        }
      };

      const onDisconnect = async (error: any) => {
        await this.destroyConnection();
        reject(new Error(`Disconnected from ${this.wsUrl}: ${error}`));
      };

      this.ws?.on("error", onError);
      this.ws?.on("message", onMessage);
      this.ws?.on("close", onDisconnect);
    });

    this.sendNewBlockSubscription();

    await listenPromise;
  }

  private async destroyConnection() {
    this.ws = null;
    await super.disconnect();
  }

  protected async disconnect(): Promise<void> {
    this.ws?.close();
    await this.destroyConnection();
  }
}
