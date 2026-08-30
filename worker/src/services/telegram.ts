import { broadcastRealtime } from "./realtime";

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number;
    };
    from?: {
      id: number;
    };
  };
};

type TelegramEnvironment = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ALLOWED_USER_ID: string;
  REALTIME_HUB: DurableObjectNamespace;
};

type TelegramMessage = NonNullable<TelegramUpdate["message"]> & {
  from: {
    id: number;
  };
  text: string;
};

type PrintCommandValues = Record<string, string>;
type ParseResult<T> = { value: T } | { error: string };

type PrintJobProperties = {
  customer: string;
  colors: string[];
  grams?: number;
  price?: number;
  payment: string;
  queue_status: "waiting" | "printing" | "done" | "paused";
  model_url: string;
  note: string;
};

const printCommandKeys = new Set([
  "customer",
  "item",
  "colors",
  "grams",
  "price",
  "payment",
  "status",
  "date",
  "model",
  "note",
]);

const queueStatuses = new Set<PrintJobProperties["queue_status"]>([
  "waiting",
  "printing",
  "done",
  "paused",
]);

async function findTelegramCapture(
  env: TelegramEnvironment,
  chatId: string,
  messageId: string,
) {
  return env.DB
    .prepare(
      `SELECT id
       FROM captures
       WHERE source = 'telegram'
         AND source_chat_id = ?
         AND source_message_id = ?
       LIMIT 1`,
    )
    .bind(chatId, messageId)
    .first<{ id: string }>();
}

async function sendTelegramReaction(
  env: TelegramEnvironment,
  message: TelegramMessage,
) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMessageReaction`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: message.chat.id,
          message_id: message.message_id,
          reaction: [
            {
              type: "emoji",
              emoji: "\u2705",
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      console.warn(
        "Telegram reaction failed",
        response.status,
        await response.text(),
      );
    }
  } catch (error) {
    console.warn("Telegram reaction request failed", error);
  }
}

async function sendTelegramMessage(
  env: TelegramEnvironment,
  message: TelegramMessage,
  text: string,
) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: message.chat.id,
          reply_parameters: {
            message_id: message.message_id,
          },
          text,
        }),
      },
    );

    if (!response.ok) {
      console.warn(
        "Telegram message response failed",
        response.status,
        await response.text(),
      );
    }
  } catch (error) {
    console.warn("Telegram message response request failed", error);
  }
}

function getTelegramMessage(update: TelegramUpdate): TelegramMessage | null {
  const message = update.message;

  if (!message || !message.from || typeof message.text !== "string") {
    return null;
  }

  const text = message.text.trim();

  if (!text) {
    return null;
  }

  return {
    ...message,
    from: message.from,
    text,
  };
}

function getPrintCommandArguments(text: string): string | null {
  const match = /^\/print(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i.exec(text);
  return match ? match[1] ?? "" : null;
}

function parsePrintCommandArguments(
  input: string,
): { values: PrintCommandValues } | { error: string } {
  const values: PrintCommandValues = {};
  let index = 0;

  while (index < input.length) {
    while (index < input.length && /\s/.test(input[index])) {
      index += 1;
    }

    if (index >= input.length) {
      break;
    }

    const keyMatch = /^[A-Za-z_]+/.exec(input.slice(index));
    if (!keyMatch) {
      return { error: "Expected a field name." };
    }

    const key = keyMatch[0];
    index += key.length;

    if (input[index] !== "=") {
      return { error: `Expected = after ${key}.` };
    }

    if (!printCommandKeys.has(key)) {
      return { error: `Unsupported field: ${key}.` };
    }

    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return { error: `Duplicate field: ${key}.` };
    }

    index += 1;
    let value = "";

    if (input[index] === "\"" || input[index] === "'") {
      const quote = input[index];
      index += 1;
      let closed = false;

      while (index < input.length) {
        const character = input[index];

        if (character === "\\") {
          index += 1;
          if (index >= input.length) {
            return { error: "Unfinished escape sequence." };
          }
          value += input[index];
          index += 1;
          continue;
        }

        if (character === quote) {
          index += 1;
          closed = true;
          break;
        }

        value += character;
        index += 1;
      }

      if (!closed) {
        return { error: "Unclosed quoted value." };
      }

      if (index < input.length && !/\s/.test(input[index])) {
        return { error: "Separate fields with whitespace." };
      }
    } else {
      const valueStart = index;
      while (index < input.length && !/\s/.test(input[index])) {
        index += 1;
      }
      value = input.slice(valueStart, index);
    }

    values[key] = value;
  }

  if (!values.item?.trim()) {
    return { error: "item is required." };
  }

  return { values };
}

function parseNonNegativeNumber(
  value: string | undefined,
  field: "grams" | "price",
): ParseResult<number | undefined> {
  if (value === undefined || !value.trim()) {
    return { value: undefined };
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return { error: `${field} must be a non-negative number.` };
  }

  return { value: number };
}

function parseDueAt(value: string | undefined): ParseResult<string | null> {
  if (value === undefined || !value.trim()) {
    return { value: null };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: "date must use YYYY-MM-DD." };
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { error: "date is invalid." };
  }

  return { value: date.toISOString() };
}

function buildPrintJob(
  values: PrintCommandValues,
): { body: string; dueAt: string | null; properties: PrintJobProperties } | { error: string } {
  const grams = parseNonNegativeNumber(values.grams, "grams");
  if ("error" in grams) return grams;

  const price = parseNonNegativeNumber(values.price, "price");
  if ("error" in price) return price;

  const dueAt = parseDueAt(values.date);
  if ("error" in dueAt) return dueAt;

  const status = values.status?.trim() || "waiting";
  if (!queueStatuses.has(status as PrintJobProperties["queue_status"])) {
    return { error: "status must be waiting, printing, done, or paused." };
  }

  return {
    body: values.item.trim(),
    dueAt: dueAt.value,
    properties: {
      customer: values.customer?.trim() ?? "",
      colors: values.colors
        ? values.colors.split(",").map((color) => color.trim()).filter(Boolean)
        : [],
      ...(grams.value === undefined ? {} : { grams: grams.value }),
      ...(price.value === undefined ? {} : { price: price.value }),
      payment: values.payment?.trim() ?? "",
      queue_status: status as PrintJobProperties["queue_status"],
      model_url: values.model?.trim() ?? "",
      note: values.note?.trim() ?? "",
    },
  };
}

function printUsage(error: string) {
  return `/print error: ${error} Usage: /print item="name" customer="name" colors="black,white" grams=250 price=5000 payment=paid status=waiting date=2026-09-03 model="https://..." note="note"`;
}

async function nextPrintQueuePosition(env: TelegramEnvironment) {
  const result = await env.DB
    .prepare(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_position
       FROM items
       WHERE kind = 'print_job'
         AND status = 'active'
         AND deleted_at IS NULL`,
    )
    .first<{ next_position: number }>();

  return Math.max(1, Number(result?.next_position) || 1);
}

async function saveTelegramPrintJob(
  env: TelegramEnvironment,
  update: TelegramUpdate,
  message: TelegramMessage,
  body: string,
  dueAt: string | null,
  properties: PrintJobProperties,
) {
  const sourceChatId = String(message.chat.id);
  const sourceMessageId = String(message.message_id);
  const sourceUserId = String(message.from.id);
  const existingCapture = await findTelegramCapture(
    env,
    sourceChatId,
    sourceMessageId,
  );

  if (existingCapture) {
    await sendTelegramReaction(env, message);
    return { result: "duplicate" as const };
  }

  const captureId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const now = new Date().toISOString();
  const position = await nextPrintQueuePosition(env);

  try {
    const results = await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO captures (
             id, source, source_chat_id, source_message_id, source_user_id,
             raw_text, raw_payload_json, created_at
           ) VALUES (?, 'telegram', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          captureId,
          sourceChatId,
          sourceMessageId,
          sourceUserId,
          message.text,
          JSON.stringify(update),
          now,
        ),
      env.DB
        .prepare(
          `INSERT INTO items (
             id, capture_id, kind, status, body, due_at, properties_json,
             position, created_at, updated_at
           ) VALUES (?, ?, 'print_job', 'active', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          itemId,
          captureId,
          body,
          dueAt,
          JSON.stringify(properties),
          position,
          now,
          now,
        ),
    ]);

    if (!results.every((result) => result.success)) {
      throw new Error("Failed to save Telegram print job.");
    }
  } catch (error) {
    const racedCapture = await findTelegramCapture(
      env,
      sourceChatId,
      sourceMessageId,
    );

    if (!racedCapture) {
      throw error;
    }

    await sendTelegramReaction(env, message);
    return { result: "duplicate" as const };
  }

  await broadcastRealtime(env, {
    type: "item_created",
    item_id: itemId,
  });

  await sendTelegramReaction(env, message);
  await sendTelegramMessage(env, message, `Print Queue item created: ${body}`);
  return { result: "stored" as const };
}

async function saveTelegramInboxItem(
  env: TelegramEnvironment,
  update: TelegramUpdate,
  message: TelegramMessage,
) {
  const sourceChatId = String(message.chat.id);
  const sourceMessageId = String(message.message_id);
  const sourceUserId = String(message.from.id);
  const existingCapture = await findTelegramCapture(
    env,
    sourceChatId,
    sourceMessageId,
  );

  if (existingCapture) {
    await sendTelegramReaction(env, message);
    return "duplicate";
  }

  const captureId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    const results = await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO captures (
             id, source, source_chat_id, source_message_id, source_user_id,
             raw_text, raw_payload_json, created_at
           ) VALUES (?, 'telegram', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          captureId,
          sourceChatId,
          sourceMessageId,
          sourceUserId,
          message.text,
          JSON.stringify(update),
          now,
        ),
      env.DB
        .prepare(
          `INSERT INTO items (
             id, capture_id, kind, status, body, created_at, updated_at
           ) VALUES (?, ?, 'inbox', 'active', ?, ?, ?)`,
        )
        .bind(itemId, captureId, message.text, now, now),
    ]);

    if (!results.every((result) => result.success)) {
      throw new Error("Failed to save Telegram capture and item.");
    }
  } catch (error) {
    const racedCapture = await findTelegramCapture(
      env,
      sourceChatId,
      sourceMessageId,
    );

    if (!racedCapture) {
      throw error;
    }

    await sendTelegramReaction(env, message);
    return "duplicate";
  }

  await broadcastRealtime(env, {
    type: "item_created",
    item_id: itemId,
  });

  await sendTelegramReaction(env, message);
  return "stored";
}

export async function processTelegramUpdate(
  env: TelegramEnvironment,
  update: TelegramUpdate,
) {
  const message = getTelegramMessage(update);

  if (!message || String(message.from.id) !== env.TELEGRAM_ALLOWED_USER_ID) {
    return "ignored";
  }

  const printArguments = getPrintCommandArguments(message.text);

  if (printArguments !== null) {
    const parsedArguments = parsePrintCommandArguments(printArguments);

    if ("error" in parsedArguments) {
      await sendTelegramMessage(env, message, printUsage(parsedArguments.error));
      return "command_error";
    }

    const printJob = buildPrintJob(parsedArguments.values);

    if ("error" in printJob) {
      await sendTelegramMessage(env, message, printUsage(printJob.error));
      return "command_error";
    }

    return (await saveTelegramPrintJob(
      env,
      update,
      message,
      printJob.body,
      printJob.dueAt,
      printJob.properties,
    )).result;
  }

  if (message.text.startsWith("/")) {
    return "ignored";
  }

  return saveTelegramInboxItem(env, update, message);
}
