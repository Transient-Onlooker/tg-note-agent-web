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
  kind?: unknown;
  properties_json?: unknown;
};

const ITEM_KINDS = [
  "inbox",
  "note",
  "task",
  "reference",
  "purchase",
  "print_job",
] as const;

const ITEM_STATUSES = [
  "active",
  "waiting",
  "done",
  "archived",
  "cancelled",
] as const;

type ItemKind = (typeof ITEM_KINDS)[number];
type ItemStatus = (typeof ITEM_STATUSES)[number];

const itemKinds = new Set<string>(ITEM_KINDS);
const itemStatuses = new Set<string>(ITEM_STATUSES);

function isItemKind(value: unknown): value is ItemKind {
  return typeof value === "string" && itemKinds.has(value);
}

function isItemStatus(value: unknown): value is ItemStatus {
  return typeof value === "string" && itemStatuses.has(value);
}

function normalizePropertiesJson(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    return JSON.stringify(parsed);
  } catch {
    return undefined;
  }
}

type UpdateItemRequest = {
  body?: unknown;
  kind?: unknown;
  status?: unknown;
  project_id?: unknown;
  due_at?: unknown;
  properties_json?: unknown;
  position?: unknown;
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
  const kind = c.req.query("kind");
  const status = c.req.query("status");
  const projectId = c.req.query("project_id");
  const dueFrom = c.req.query("due_from");
  const dueTo = c.req.query("due_to");

  if (kind && !isItemKind(kind)) {
    return c.json({ error: "invalid_kind" }, 400);
  }

  if (status && !isItemStatus(status)) {
    return c.json({ error: "invalid_status" }, 400);
  }

  if (dueFrom && Number.isNaN(Date.parse(dueFrom))) {
    return c.json({ error: "invalid_due_from" }, 400);
  }

  if (dueTo && Number.isNaN(Date.parse(dueTo))) {
    return c.json({ error: "invalid_due_to" }, 400);
  }

  const conditions = ["deleted_at IS NULL"];
  const bindings: string[] = [];

  if (kind) {
    conditions.push("kind = ?");
    bindings.push(kind);
  }

  if (status) {
    conditions.push("status = ?");
    bindings.push(status);
  }

  if (projectId) {
    conditions.push("project_id = ?");
    bindings.push(projectId);
  }

  if (dueFrom) {
    conditions.push("due_at >= ?");
    bindings.push(new Date(dueFrom).toISOString());
  }

  if (dueTo) {
    conditions.push("due_at < ?");
    bindings.push(new Date(dueTo).toISOString());
  }

  const orderBy = kind === "print_job"
    ? "ORDER BY position ASC, created_at ASC, id ASC"
    : "ORDER BY created_at DESC";

  const statement = c.env.DB.prepare(`
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
    WHERE ${conditions.join("\n      AND ")}
    ${orderBy}
    LIMIT 100
  `);

  const result =
    bindings.length > 0
      ? await statement.bind(...bindings).all()
      : await statement.all();

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

  const kind = payload.kind ?? "inbox";
  if (!isItemKind(kind)) {
    return c.json({ error: "invalid_kind" }, 400);
  }

  const propertiesJson = payload.properties_json === undefined
    ? "{}"
    : normalizePropertiesJson(payload.properties_json);
  if (propertiesJson === undefined) {
    return c.json({ error: "invalid_properties_json" }, 400);
  }

  const position = kind === "print_job"
    ? Math.max(
        1,
        Number(
          (await c.env.DB
            .prepare(`
              SELECT COALESCE(MAX(position), 0) + 1 AS next_position
              FROM items
              WHERE kind = 'print_job'
                AND status = 'active'
                AND deleted_at IS NULL
            `)
            .first<{ next_position: number }>())?.next_position,
        ) || 1,
      )
    : 0;

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
          properties_json,
          position,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `)
      .bind(itemId, captureId, kind, body, propertiesJson, position, now, now),
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
        kind,
        status: "active",
        title: null,
        body,
        properties_json: propertiesJson,
        position,
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

  if (!payload || typeof payload !== "object") {
    return c.json({ error: "invalid_body" }, 400);
  }

  const assignments: string[] = [];
  const bindings: (string | number | null)[] = [];

  const hasBody = Object.prototype.hasOwnProperty.call(payload, "body");
  const hasKind = Object.prototype.hasOwnProperty.call(payload, "kind");
  const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status");
  const hasProjectId = Object.prototype.hasOwnProperty.call(
    payload,
    "project_id",
  );
  const hasDueAt = Object.prototype.hasOwnProperty.call(payload, "due_at");
  const hasPropertiesJson = Object.prototype.hasOwnProperty.call(
    payload,
    "properties_json",
  );
  const hasPosition = Object.prototype.hasOwnProperty.call(payload, "position");

  if (hasBody) {
    if (typeof payload.body !== "string") {
      return c.json({ error: "invalid_body" }, 400);
    }

    const body = payload.body.trim();

    if (!body) {
      return c.json({ error: "invalid_body" }, 400);
    }

    assignments.push("body = ?");
    bindings.push(body);
  }

  if (hasKind) {
    const kind = payload.kind;

    if (!isItemKind(kind)) {
      return c.json({ error: "invalid_kind" }, 400);
    }

    assignments.push("kind = ?");
    bindings.push(kind);
  }

  if (hasStatus) {
    const status = payload.status;

    if (!isItemStatus(status)) {
      return c.json({ error: "invalid_status" }, 400);
    }

    assignments.push("status = ?");
    bindings.push(status);
  }

  if (hasProjectId) {
    if (
      payload.project_id !== null &&
      (typeof payload.project_id !== "string" ||
        !payload.project_id.trim())
    ) {
      return c.json({ error: "invalid_project_id" }, 400);
    }

    assignments.push("project_id = ?");
    bindings.push(
      typeof payload.project_id === "string"
        ? payload.project_id.trim()
        : null,
    );
  }

  if (hasDueAt) {
    if (
      payload.due_at !== null &&
      (typeof payload.due_at !== "string" ||
        Number.isNaN(Date.parse(payload.due_at)))
    ) {
      return c.json({ error: "invalid_due_at" }, 400);
    }

    assignments.push("due_at = ?");
    bindings.push(
      typeof payload.due_at === "string"
        ? new Date(payload.due_at).toISOString()
        : null,
    );
  }

  if (hasPropertiesJson) {
    const propertiesJson = normalizePropertiesJson(payload.properties_json);

    if (propertiesJson === undefined) {
      return c.json({ error: "invalid_properties_json" }, 400);
    }

    assignments.push("properties_json = ?");
    bindings.push(propertiesJson);
  }

  if (hasPosition) {
    if (
      typeof payload.position !== "number" ||
      !Number.isInteger(payload.position) ||
      payload.position < 0
    ) {
      return c.json({ error: "invalid_position" }, 400);
    }

    assignments.push("position = ?");
    bindings.push(payload.position);
  }

  if (assignments.length === 0) {
    return c.json({ error: "no_changes" }, 400);
  }

  const itemId = c.req.param("id");
  const now = new Date().toISOString();

  const result = await c.env.DB
    .prepare(`
      UPDATE items
      SET
        ${assignments.join(",\n        ")},
        updated_at = ?,
        version = version + 1
      WHERE id = ?
        AND deleted_at IS NULL
    `)
    .bind(...bindings, now, itemId)
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
    .bind(itemId)
    .first();

  c.executionCtx.waitUntil(
    broadcastRealtime(c.env, {
      type: "item_updated",
      item_id: itemId,
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
