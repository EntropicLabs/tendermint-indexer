import WebSocket, { Server } from "ws";
import { IncomingMessage } from "http";
import logger from "../src/modules/logger";

export async function checkErrorThrow(callback: () => Promise<void>) {
  try {
    await callback();
    return false;
  } catch {
    return true;
  }
}

const mockBlock = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    data: {
      type: "tendermint/event/NewBlock",
      value: { block: { header: { height: "19095092" } } },
    },
    query: "",
    events: {},
  },
};

// A server that mocks an Tendermint RPC node, but only accepts connections
// after 3 attempts. Any additional attempts will result in an automatic disconnect.
export class TestWebSocketServer {
  private server: Server | null = null;
  private port: number;
  private connectionAttempts = 0;

  constructor(port: number) {
    this.port = port;
  }

  public start(): void {
    if (this.server) {
      logger.warn("WebSocket server is already running.");
      return;
    }

    this.server = new Server({ port: this.port });

    this.server.on(
      "connection",
      async (socket: WebSocket, req: IncomingMessage) => {
        if (this.connectionAttempts < 3) {
          this.connectionAttempts += 1;
          socket.terminate();
          return;
        }

        this.connectionAttempts += 1;

        /**
         * TODO: Implement Tendermint RPC send
         **/
        socket.on("message", (data: WebSocket.Data) => {
          socket.send(JSON.stringify(mockBlock));
        });

        socket.on("close", () => {});
        socket.on("error", (error: Error) => {});
      }
    );
  }

  public stop(): void {
    if (this.server) {
      this.server.close(() => {});
      this.server = null;
    }
  }
}
