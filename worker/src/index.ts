import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  processTelegramUpdate,
  type TelegramUpdate,
} from "./services/telegram";

type Bindings = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ALLOWED_USER_ID: string;
};

type CreateItemRequest = {
  body?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "/api/*",
  cors({
    origin: [
      "http://localhost:5173",
      "https://transient-onlooker.github.io",
    ],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "note-relay-api",
  });
});

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    service: "note-relay-api",
  });
});

app.get("/api/items", async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT
      id,
      capture_id,
      parent_id,
      project_id,
      kind,
      status,
      title,
      body,
      due_at,
      properties_json,
      position,
      triaged_at,
      created_at,
      updated_at,
      deleted_at,
      version
    FROM items
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 100
  `).all();

  return c.json({
    items: result.results,
  });
});

app.post("/api/items", async (c) => {
  let payload: CreateItemRequest;

  try {
    payload = await c.req.json<CreateItemRequest>();
  } catch {
    return c.json(
      {
        error: "invalid_json",
        message: "Request body must be valid JSON.",
      },
      400,
    );
  }

  const body = payload.body?.trim();

  if (!body) {
    return c.json(
      {
        error: "invalid_body",
        message: "body is required.",
      },
      400,
    );
  }

  const captureId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const now = new Date().toISOString();

  const results = await c.env.DB.batch([
    c.env.DB
      .prepare(`
        INSERT INTO captures (
          id,
          source,
          raw_text,
          created_at
        )
        VALUES (?, 'web', ?, ?)
      `)
      .bind(captureId, body, now),

    c.env.DB
      .prepare(`
        INSERT INTO items (
          id,
          capture_id,
          kind,
          status,
          body,
          created_at,
          updated_at
        )
        VALUES (?, ?, 'inbox', 'active', ?, ?, ?)
      `)
      .bind(itemId, captureId, body, now, now),
  ]);

  if (!results.every((result) => result.success)) {
    return c.json(
      {
        error: "database_error",
        message: "Failed to create item.",
      },
      500,
    );
  }

  return c.json(
    {
      item: {
        id: itemId,
        capture_id: captureId,
        kind: "inbox",
        status: "active",
        title: null,
        body,
        created_at: now,
        updated_at: now,
        version: 1,
      },
    },
    201,
  );
});

app.delete("/api/items/:id", async (c) => {
  const now = new Date().toISOString();
  const result = await c.env.DB
    .prepare(`
      UPDATE items
      SET
        deleted_at = ?,
        updated_at = ?,
        version = version + 1
      WHERE id = ?
        AND deleted_at IS NULL
    `)
    .bind(now, now, c.req.param("id"))
    .run();

  if (result.meta.changes !== 1) {
    return c.json(
      {
        error: "not_found",
      },
      404,
    );
  }

  return c.json({ ok: true });
});

app.post("/telegram/webhook", async (c) => {
  const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token");

  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json(
      {
        error: "unauthorized",
      },
      401,
    );
  }

  let update: TelegramUpdate;

  try {
    update = await c.req.json<TelegramUpdate>();
  } catch {
    return c.json({ ok: true });
  }

  try {
    await processTelegramUpdate(c.env, update);
  } catch (error) {
    console.error("Telegram webhook failed", error);
    return c.json(
      {
        error: "webhook_failed",
      },
      500,
    );
  }

  return c.json({ ok: true });
});

app.notFound((c) => {
  return c.json(
    {
      error: "not_found",
      message: "Route not found.",
    },
    404,
  );
});

export default app;
