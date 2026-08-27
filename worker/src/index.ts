import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  processTelegramUpdate,
  type TelegramUpdate,
} from "./services/telegram";
import {
  broadcastRealtime,
} from "./services/realtime";

export { RealtimeHub } from "./services/realtime";

type Bindings = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ALLOWED_USER_ID: string;
  WEB_API_TOKEN: string;
  REALTIME_HUB: DurableObjectNamespace;
};

type CreateItemRequest = {
  body?: string;
};

type UpdateItemRequest = {
  body?: unknown;
};

const app = new Hono<{ Bindings: Bindings }>();

const allowedOrigins = new Set([
  "http://localhost:5173",
  "https://transient-onlooker.github.io",
]);

app.get("/ws", async (c) => {
  const origin = c.req.header("Origin");

  if (origin && !allowedOrigins.has(origin)) {
    return c.text("Forbidden", 403);
  }

  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.text("Upgrade Required", 426);
  }

  const id = c.env.REALTIME_HUB.idFromName("global");
  return c.env.REALTIME_HUB.get(id).fetch(c.req.raw);
});

app.use(
  "/api/*",
  cors({
    origin: [
      "http://localhost:5173",
      "https://transient-onlooker.github.io",
    ],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
  }),
);

app.use("/api/*", async (c, next) => {
  const authorization = c.req.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const token = authorization.slice("Bearer ".length);

  if (!token || token !== c.env.WEB_API_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
});

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

app.get("/api/trash", async (c) => {
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
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
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

  c.executionCtx.waitUntil(
    broadcastRealtime(c.env, {
      type: "item_created",
      item_id: itemId,
    }),
  );

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

app.patch("/api/items/:id", async (c) => {
  let payload: UpdateItemRequest;

  try {
    payload = await c.req.json<UpdateItemRequest>();
  } catch {
    return c.json({ error: "invalid_body" }, 400);
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.body !== "string"
  ) {
    return c.json({ error: "invalid_body" }, 400);
  }

  const body = payload.body.trim();

  if (!body) {
    return c.json({ error: "invalid_body" }, 400);
  }

  const now = new Date().toISOString();
  const result = await c.env.DB
    .prepare(`
      UPDATE items
      SET
        body = ?,
        updated_at = ?,
        version = version + 1
      WHERE id = ?
        AND deleted_at IS NULL
    `)
    .bind(body, now, c.req.param("id"))
    .run();

  if (result.meta.changes !== 1) {
    return c.json({ error: "not_found" }, 404);
  }

  const item = await c.env.DB
    .prepare(`
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
      WHERE id = ?
      LIMIT 1
    `)
    .bind(c.req.param("id"))
    .first();

  c.executionCtx.waitUntil(
    broadcastRealtime(c.env, {
      type: "item_updated",
      item_id: c.req.param("id"),
    }),
  );

  return c.json({ item });
});

app.post("/api/items/:id/restore", async (c) => {
  const now = new Date().toISOString();
  const result = await c.env.DB
    .prepare(`
      UPDATE items
      SET
        deleted_at = NULL,
        updated_at = ?,
        version = version + 1
      WHERE id = ?
        AND deleted_at IS NOT NULL
    `)
    .bind(now, c.req.param("id"))
    .run();

  if (result.meta.changes !== 1) {
    return c.json({ error: "not_found" }, 404);
  }

  const item = await c.env.DB
    .prepare(`
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
      WHERE id = ?
      LIMIT 1
    `)
    .bind(c.req.param("id"))
    .first();

  c.executionCtx.waitUntil(
    broadcastRealtime(c.env, {
      type: "item_restored",
      item_id: c.req.param("id"),
    }),
  );

  return c.json({ item });
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

  c.executionCtx.waitUntil(
    broadcastRealtime(c.env, {
      type: "item_deleted",
      item_id: c.req.param("id"),
    }),
  );

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
