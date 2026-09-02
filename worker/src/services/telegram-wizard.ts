import { DurableObject } from "cloudflare:workers";

export type PrintWizardValues = Record<string, string>;

export type PrintWizardSession = {
  chatId: number;
  userId: number;
  sourceMessageId: number;
  step: number;
  values: PrintWizardValues;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  lastPromptMessageId?: number;
  lastReplyMessageId?: number;
  lastCallbackId?: string;
  lastCallbackMessageId?: number;
  lastCallbackAction?: string;
};

export const printWizardFields = [
  { key: "item", label: "\ucd9c\ub825\ubb3c", required: true, hint: "\ucd9c\ub825\ud560 \ubb3c\uac74 \uc774\ub984\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "customer", label: "\uace0\uac1d", required: false, hint: "\uace0\uac1d \uc774\ub984\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "colors", label: "\uc0c9\uc0c1", required: false, hint: "\uc0c9\uc0c1\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694. \uc5ec\ub7ec \uc0c9\uc0c1\uc740 \uacf5\ubc31 \ub610\ub294 \uc27c\ud45c\ub85c \uad6c\ubd84\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4." },
  { key: "grams", label: "\ubb34\uac8c", required: false, hint: "\uc608\uc0c1 \ubb34\uac8c(g)\ub97c \uc22b\uc790\ub85c \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "price", label: "\uae08\uc561", required: false, hint: "\uae08\uc561(\uc6d0)\uc744 \uc22b\uc790\ub85c \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "payment", label: "\uacb0\uc81c", required: false, hint: "\uacb0\uc81c \uc0c1\ud0dc \ub610\ub294 \uba54\ubaa8\ub97c \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "status", label: "\uc0c1\ud0dc", required: false, hint: "\uc0c1\ud0dc\ub97c \uc785\ub825\ud558\uc138\uc694. missing, waiting, printing, done, paused" },
  { key: "date", label: "\ucd9c\ub825 \uc608\uc815\uc77c", required: false, hint: "\ub0a0\uc9dc\ub97c YYYY-MM-DD \ud615\uc2dd\uc73c\ub85c \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "model", label: "\ubaa8\ub378 URL", required: false, hint: "\ubaa8\ub378 URL\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "note", label: "\ube44\uace0", required: false, hint: "\ube44\uace0\ub97c \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
] as const;

const storageKey = "session";
const sessionTtlMs = 20 * 60 * 1000;
type StartRequest = Pick<PrintWizardSession, "chatId" | "userId" | "sourceMessageId">;
type NextRequest = {
  value?: string;
  replyMessageId?: number;
  callbackId?: string;
  callbackMessageId?: number;
  callbackAction?: string;
};
type PromptRequest = {
  messageId?: number;
  expectedStep?: number;
};

export class TelegramPrintWizard extends DurableObject<Record<string, never>> {
  private async getSession() {
    const session = await this.ctx.storage.get<PrintWizardSession>(storageKey);
    if (!session) return null;
    if (typeof session.expiresAt !== "number" || session.expiresAt <= Date.now()) {
      await this.ctx.storage.delete(storageKey);
      return null;
    }
    return session;
  }

  private getExpiration() {
    return Date.now() + sessionTtlMs;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/session") {
      return Response.json({ session: await this.getSession() });
    }

    if (request.method === "POST" && url.pathname === "/start") {
      const payload = await request.json<StartRequest>();
      const now = Date.now();
      const session: PrintWizardSession = {
        chatId: payload.chatId,
        userId: payload.userId,
        sourceMessageId: payload.sourceMessageId,
        step: 0,
        values: {},
        createdAt: now,
        updatedAt: now,
        expiresAt: now + sessionTtlMs,
      };
      await this.ctx.storage.put(storageKey, session);
      return Response.json({ session });
    }

    if (request.method === "POST" && url.pathname === "/prompt") {
      const session = await this.getSession();
      if (!session) return Response.json({ error: "not_found" }, { status: 404 });
      const payload = await request.json<PromptRequest>();
      if (typeof payload.messageId !== "number") return Response.json({ error: "message_id_required" }, { status: 400 });
      if (payload.expectedStep !== undefined && payload.expectedStep !== session.step) {
        return Response.json({ session, stale: true });
      }
      const nextSession: PrintWizardSession = {
        ...session,
        lastPromptMessageId: payload.messageId,
        updatedAt: Date.now(),
        expiresAt: this.getExpiration(),
      };
      await this.ctx.storage.put(storageKey, nextSession);
      return Response.json({ session: nextSession });
    }

    if (request.method === "POST" && url.pathname === "/next") {
      const session = await this.getSession();
      if (!session) return Response.json({ error: "not_found" }, { status: 404 });
      const payload = await request.json<NextRequest>();
      if ((payload.replyMessageId !== undefined && session.lastReplyMessageId === payload.replyMessageId) ||
        (payload.callbackId && session.lastCallbackId === payload.callbackId) ||
        (payload.callbackMessageId !== undefined &&
          payload.callbackAction !== undefined &&
          payload.callbackMessageId === session.lastCallbackMessageId &&
          payload.callbackAction === session.lastCallbackAction)) {
        return Response.json({ session, duplicate: true });
      }

      const field = printWizardFields[session.step];
      if (!field) return Response.json({ session });
      const value = typeof payload.value === "string" ? payload.value.trim() : "";
      if (field.required && !value) return Response.json({ error: "required" }, { status: 400 });

      const nextSession: PrintWizardSession = {
        ...session,
        step: session.step + 1,
        values: { ...session.values, [field.key]: value },
        lastPromptMessageId: undefined,
        ...(payload.replyMessageId !== undefined ? { lastReplyMessageId: payload.replyMessageId } : {}),
        ...(payload.callbackId ? { lastCallbackId: payload.callbackId } : {}),
        ...(payload.callbackMessageId !== undefined ? { lastCallbackMessageId: payload.callbackMessageId } : {}),
        ...(payload.callbackAction ? { lastCallbackAction: payload.callbackAction } : {}),
        updatedAt: Date.now(),
        expiresAt: this.getExpiration(),
      };
      await this.ctx.storage.put(storageKey, nextSession);
      return Response.json({ session: nextSession, duplicate: false });
    }

    if (request.method === "POST" && url.pathname === "/confirm") {
      const session = await this.getSession();
      if (!session) return Response.json({ error: "not_found" }, { status: 404 });
      const payload = await request.json<NextRequest>();
      if ((payload.callbackId && session.lastCallbackId === payload.callbackId) ||
        (payload.callbackMessageId !== undefined &&
          payload.callbackAction !== undefined &&
          payload.callbackMessageId === session.lastCallbackMessageId &&
          payload.callbackAction === session.lastCallbackAction)) {
        return Response.json({ session, duplicate: true });
      }
      if (session.step < printWizardFields.length) {
        return Response.json({ error: "incomplete" }, { status: 409 });
      }
      await this.ctx.storage.delete(storageKey);
      return Response.json({ session, duplicate: false });
    }

    if (request.method === "DELETE" && url.pathname === "/session") {
      await this.ctx.storage.delete(storageKey);
      return Response.json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  }
}
