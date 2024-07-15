import "dotenv/config";
import { WebSocket } from "ws";
import type { AddEventFunction } from "../types/AddEventFunction";
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

  /**
   * Create a new CometWsClient
   * @param wsUrl Websocket client URL
   * @param retrier Retrier for reconnecting to websocket client on failure
   * @param addEvent Optional callback for recording new block or connection events
   * @returns CometWsClient
   */
  static async create(
    wsUrl: string,
    retrier: Retrier,
    addEvent?: AddEventFunction
  ) {
    return new CometWsClient(wsUrl, retrier, addEvent);
  }

  /**
   * @param wsUrl Websocket client URL
   * @param retrier Retrier for reconnecting to websocket client on failure
   * @param addEvent Optional callback for recording new block or connection events
   */
  constructor(wsUrl: string, retrier: Retrier, addEvent?: AddEventFunction) {
    super(retrier, addEvent);
    this.wsUrl = wsUrl;
  }

  /**
   * Connect to WebSocket client and retry on error or disconnect
   */
  protected async connect() {
    const connectionPromise = new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      const onOpen = () => {
        logger.info(`Connected to ${this.wsUrl}`);
        this.ws?.removeAllListeners();
        resolve();
      };
      const onOpenError = (error: any) => {
        logger.error(`Error connecting to ${this.wsUrl}: ${error}`);
        this.ws?.close();
      };

      const onDisconnect = async (error: any) => {
        this.ws?.removeAllListeners();
        this.ws = null;
        await super.disconnect();
        reject(new Error(`Disconnected from ${this.wsUrl}: ${error}`));
      };

      this.ws.on("open", onOpen);
      this.ws.on("error", onOpenError);
      this.ws.on("close", onDisconnect);
    });

    await connectionPromise;
    super.connect();
  }

  /**
   * Parses string data received from WebSocket connection into a Tendermint RPC Event
   * @param data Raw string data
   * @returns Tendermint RPC event
   */
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
      logger.error(`Error in ${this.wsUrl} parseMessage() ${error}`);
      return null;
    }
  }

  /**
   * Sends a new block subscription
   */
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

  /**
   * Start listening for new block events
   */
  protected async doListen() {
    if (!this.ws) throw new Error("Websocket is not connected");

    const listenPromise = new Promise<void>((resolve, reject) => {
      const onError = (error: any) => {
        logger.error(`Error in ${this.wsUrl}:`, error);
        this.ws?.close(error);
      };

      const onMessage = async (data: any) => {
        const event = this.parseMessage(data.toString());

        if (event == null) {
          return;
        }

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
          this.addEvent?.({
            blockHeight,
          });
        } else {
          throw new Error(
            `Unanticipated result data type ${event.result.data.type}.'`
          );
        }
      };

      const onDisconnect = async (code: number, reason: Buffer) => {
        this.ws?.removeAllListeners();
        this.ws = null;
        await super.disconnect();

        // Throw error if not a normal closure or going away
        if (!(code === 1000 || code === 1001)) {
          reject(new Error(`Disconnected from ${this.wsUrl}: ${reason}`));
        }
      };

      this.ws?.on("error", onError);
      this.ws?.on("message", onMessage);
      this.ws?.on("close", onDisconnect);
    });

    this.sendNewBlockSubscription();

    await listenPromise;
  }

  /**
   * Closes WebSocket connection
   */
  protected async disconnect(): Promise<void> {
    // Disconnect with normal closure
    this.ws?.close(1000);
  }
}
