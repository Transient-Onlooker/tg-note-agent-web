import { DurableObject } from "cloudflare:workers";

export type RealtimeEvent =
  | { type: "item_created"; item_id: string }
  | { type: "item_updated"; item_id: string }
  | { type: "item_deleted"; item_id: string }
  | { type: "item_restored"; item_id: string }
  | { type: "trash_emptied" }
  | { type: "project_changed" };

type RealtimeEnvironment = {
  REALTIME_HUB: DurableObjectNamespace;
};

type RealtimeHubEnvironment = {
  WEB_API_TOKEN: string;
};

type SocketAttachment = {
  authenticated: boolean;
};

type AuthMessage = {
  type?: unknown;
  token?: unknown;
};

function isWebSocketUpgrade(request: Request) {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

export class RealtimeHub extends DurableObject<RealtimeHubEnvironment> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/broadcast") {
      let event: RealtimeEvent;

      try {
        event = await request.json<RealtimeEvent>();
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      this.broadcast(event);
      return new Response(null, { status: 204 });
    }

    if (!isWebSocketUpgrade(request)) {
      return new Response("Upgrade Required", { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ authenticated: false } satisfies SocketAttachment);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(webSocket: WebSocket, message: string | ArrayBuffer) {
    const attachment = this.getAttachment(webSocket);

    if (attachment.authenticated) {
      return;
    }

    if (typeof message !== "string") {
      webSocket.close(1008, "unauthorized");
      return;
    }

    let authMessage: AuthMessage;

    try {
      authMessage = JSON.parse(message) as AuthMessage;
    } catch {
      webSocket.close(1008, "unauthorized");
      return;
    }

    if (
      authMessage.type !== "auth" ||
      authMessage.token !== this.env.WEB_API_TOKEN
    ) {
      webSocket.close(1008, "unauthorized");
      return;
    }

    webSocket.serializeAttachment({ authenticated: true } satisfies SocketAttachment);
    webSocket.send(JSON.stringify({ type: "ready" }));
  }

  webSocketClose(
    webSocket: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    void webSocket;
    void code;
    void reason;
    void wasClean;
  }

  webSocketError(webSocket: WebSocket, error: unknown) {
    void webSocket;
    console.warn("Realtime WebSocket error", error);
  }

  private getAttachment(webSocket: WebSocket): SocketAttachment {
    return (
      (webSocket.deserializeAttachment() as SocketAttachment | null) ?? {
        authenticated: false,
      }
    );
  }

  private broadcast(event: RealtimeEvent) {
    const message = JSON.stringify(event);

    for (const webSocket of this.ctx.getWebSockets()) {
      if (!this.getAttachment(webSocket).authenticated) {
        continue;
      }

      try {
        webSocket.send(message);
      } catch (error) {
        console.warn("Realtime broadcast failed", error);
      }
    }
  }
}

export async function broadcastRealtime(
  env: RealtimeEnvironment,
  event: RealtimeEvent,
) {
  try {
    const id = env.REALTIME_HUB.idFromName("global");
    const stub = env.REALTIME_HUB.get(id);
    const response = await stub.fetch("https://realtime/broadcast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.warn("Realtime broadcast request failed", response.status);
    }
  } catch (error) {
    console.warn("Realtime broadcast request failed", error);
  }
}
