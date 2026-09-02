import { DurableObject } from "cloudflare:workers";

export type PrintWizardValues = Record<string, string>;

export type PrintWizardSession = {
  chatId: number;
  userId: number;
  sourceMessageId: number;
  step: number;
  values: PrintWizardValues;
};

export const printWizardFields = [
  { key: "item", label: "\ucd9c\ub825\ubb3c", required: true, hint: "\ucd9c\ub825\ud560 \ubb3c\uac74 \uc774\ub984\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "customer", label: "\uace0\uac1d", required: false, hint: "\uace0\uac1d \uc774\ub984\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "colors", label: "\uc0c9\uc0c1", required: false, hint: "\uc0c9\uc0c1\uc744 \uc27c\ud45c\ub85c \uad6c\ubd84\ud558\uc5ec \uc785\ub825\ud574 \uc8fc\uc138\uc694. \uc608: black,white" },
  { key: "grams", label: "\ubb34\uac8c", required: false, hint: "\uc608\uc0c1 \ubb34\uac8c(g)\ub97c \uc22b\uc790\ub85c \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "price", label: "\uae08\uc561", required: false, hint: "\uae08\uc561(\uc6d0)\uc744 \uc22b\uc790\ub85c \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "payment", label: "\uacb0\uc81c", required: false, hint: "\uacb0\uc81c \uc0c1\ud0dc \ub610\ub294 \uba54\ubaa8\ub97c \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "status", label: "\uc0c1\ud0dc", required: false, hint: "\uc0c1\ud0dc\ub97c \uc785\ub825\ud558\uc138\uc694. missing, waiting, printing, done, paused" },
  { key: "date", label: "\ucd9c\ub825 \uc608\uc815\uc77c", required: false, hint: "\ub0a0\uc9dc\ub97c YYYY-MM-DD \ud615\uc2dd\uc73c\ub85c \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "model", label: "\ubaa8\ub378 URL", required: false, hint: "\ubaa8\ub378 URL\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
  { key: "note", label: "\ube44\uace0", required: false, hint: "\ube44\uace0\ub97c \uc785\ub825\ud574 \uc8fc\uc138\uc694." },
] as const;

const storageKey = "session";
type StartRequest = Pick<PrintWizardSession, "chatId" | "userId" | "sourceMessageId">;
type NextRequest = { value?: string };

export class TelegramPrintWizard extends DurableObject<Record<string, never>> {
  private async getSession() {
    return this.ctx.storage.get<PrintWizardSession>(storageKey);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/session") {
      return Response.json({ session: await this.getSession() });
    }

    if (request.method === "POST" && url.pathname === "/start") {
      const payload = await request.json<StartRequest>();
      const session: PrintWizardSession = {
        chatId: payload.chatId,
        userId: payload.userId,
        sourceMessageId: payload.sourceMessageId,
        step: 0,
        values: {},
      };
      await this.ctx.storage.put(storageKey, session);
      return Response.json({ session });
    }

    if (request.method === "POST" && url.pathname === "/next") {
      const session = await this.getSession();
      if (!session) return Response.json({ error: "not_found" }, { status: 404 });

      const field = printWizardFields[session.step];
      if (!field) return Response.json({ session });
      const payload = await request.json<NextRequest>();
      const value = typeof payload.value === "string" ? payload.value.trim() : "";
      if (field.required && !value) return Response.json({ error: "required" }, { status: 400 });

      const nextSession: PrintWizardSession = {
        ...session,
        step: session.step + 1,
        values: { ...session.values, [field.key]: value },
      };
      await this.ctx.storage.put(storageKey, nextSession);
      return Response.json({ session: nextSession });
    }

    if (request.method === "DELETE" && url.pathname === "/session") {
      await this.ctx.storage.delete(storageKey);
      return Response.json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  }
}