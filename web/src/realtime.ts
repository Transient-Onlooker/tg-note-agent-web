import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  API_BASE_URL,
  AUTH_EXPIRED_EVENT,
  clearAccessKey,
  getAccessKey,
} from "./api/auth";
import { itemCountQueryKeys, itemQueryKeys } from "./api/items";
import { projectQueryKeys } from "./api/projects";

type RealtimeEvent = {
  type:
    | "item_created"
    | "item_updated"
    | "item_deleted"
    | "item_restored"
    | "trash_emptied"
    | "project_changed";
  item_id?: string;
};

const reconnectDelays = [1000, 2000, 5000, 10000, 15000];

function getWebSocketUrl() {
  const url = new URL(`${API_BASE_URL}/ws`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function notifyQueries(queryClient: QueryClient, event: RealtimeEvent) {
  void queryClient.invalidateQueries({ queryKey: itemCountQueryKeys.all });

  if (event.type === "project_changed") {
    void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
    return;
  }

  if (event.type === "item_deleted" || event.type === "item_restored" || event.type === "trash_emptied") {
    void queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
    return;
  }

  void queryClient.invalidateQueries({ queryKey: itemQueryKeys.all });
}

export function useRealtimeSync(queryClient: QueryClient): void {
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let stopped = false;

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer !== null || !getAccessKey()) {
        return;
      }

      const delay =
        reconnectDelays[Math.min(reconnectAttempt, reconnectDelays.length - 1)];
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (stopped || !getAccessKey()) {
        return;
      }

      const currentSocket = new WebSocket(getWebSocketUrl());
      socket = currentSocket;

      currentSocket.addEventListener("open", () => {
        const key = getAccessKey();

        if (!key || socket !== currentSocket) {
          currentSocket.close();
          return;
        }

        reconnectAttempt = 0;
        currentSocket.send(JSON.stringify({ type: "auth", token: key }));
      });

      currentSocket.addEventListener("message", (message) => {
        if (typeof message.data !== "string") {
          return;
        }

        let event: RealtimeEvent;

        try {
          event = JSON.parse(message.data) as RealtimeEvent;
        } catch {
          return;
        }

        if (
          event.type === "item_created" ||
          event.type === "item_updated" ||
          event.type === "item_deleted" ||
          event.type === "item_restored" ||
          event.type === "trash_emptied" ||
          event.type === "project_changed"
        ) {
          notifyQueries(queryClient, event);
        }
      });

      currentSocket.addEventListener("close", (event) => {
        if (socket !== currentSocket) {
          return;
        }

        socket = null;

        if (event.code === 1008) {
          clearAccessKey();
          window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
          return;
        }

        scheduleReconnect();
      });

      currentSocket.addEventListener("error", () => {
        currentSocket.close();
      });
    };

    connect();

    return () => {
      stopped = true;

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }

      reconnectTimer = null;
      socket?.close();
      socket = null;
    };
  }, [queryClient]);
}
