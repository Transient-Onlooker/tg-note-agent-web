import { broadcastRealtime } from "./realtime";
import { printWizardFields, type PrintWizardSession } from "./telegram-wizard";

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: { id: number };
    reply_to_message?: { message_id: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
  };
};

type TelegramEnvironment = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ALLOWED_USER_ID: string;
  REALTIME_HUB: DurableObjectNamespace;
  TELEGRAM_PRINT_WIZARD: DurableObjectNamespace;
};

type TelegramMessage = NonNullable<TelegramUpdate["message"]> & {
  from: { id: number };
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
  queue_status: "missing" | "waiting" | "printing" | "done" | "paused";
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
  "missing",
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

    const result = await response
      .json<{ ok?: boolean; error_code?: number; description?: string }>()
      .catch(() => null);

    if (!response.ok || result?.ok !== true) {
      console.warn("Telegram reaction failed", {
        status: response.status,
        errorCode: result?.error_code,
        description: result?.description,
      });
    }
  } catch (error) {
    console.warn("Telegram reaction request failed", error);
  }
}

type TelegramReplyTarget = Pick<TelegramMessage, "message_id" | "chat">;
type TelegramKeyboard = Array<Array<{ text: string; callback_data: string }>>;

async function sendTelegramMessage(env: TelegramEnvironment, message: TelegramReplyTarget, text: string, keyboard?: TelegramKeyboard) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: message.chat.id, reply_parameters: { message_id: message.message_id }, text, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) }),
    });
    const result = await response
      .json<{ ok?: boolean; result?: { message_id?: number }; error_code?: number; description?: string }>()
      .catch(() => null);
    if (!response.ok || result?.ok !== true) {
      console.warn("Telegram message response failed", {
        status: response.status,
        errorCode: result?.error_code,
        description: result?.description,
      });
      return null;
    }
    return typeof result.result?.message_id === "number" ? result.result.message_id : null;
  } catch (error) {
    console.warn("Telegram message response request failed", error);
    return null;
  }
}

async function answerTelegramCallback(env: TelegramEnvironment, callbackId: string) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: callbackId }),
    });
    const result = await response.json<{ ok?: boolean; error_code?: number; description?: string }>().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      console.warn("Telegram callback acknowledgement failed", { status: response.status, errorCode: result?.error_code, description: result?.description });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("Telegram callback acknowledgement request failed", error);
    return false;
  }
}
function getPrintWizardStub(env: TelegramEnvironment, userId: number) {
  return env.TELEGRAM_PRINT_WIZARD.get(env.TELEGRAM_PRINT_WIZARD.idFromName(`telegram-print:${userId}`));
}

async function readPrintWizardSession(env: TelegramEnvironment, userId: number): Promise<PrintWizardSession | null> {
  const response = await getPrintWizardStub(env, userId).fetch("https://telegram-print/session");
  if (!response.ok) { console.warn("Telegram print wizard read failed", response.status); return null; }
  return (await response.json<{ session: PrintWizardSession | null }>()).session;
}

async function startPrintWizard(env: TelegramEnvironment, message: TelegramMessage): Promise<PrintWizardSession | null> {
  const response = await getPrintWizardStub(env, message.from.id).fetch("https://telegram-print/start", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId: message.chat.id, userId: message.from.id, sourceMessageId: message.message_id }),
  });
  if (!response.ok) { console.warn("Telegram print wizard start failed", response.status); return null; }
  return (await response.json<{ session: PrintWizardSession }>()).session;
}

async function advancePrintWizard(env: TelegramEnvironment, userId: number, value: string, replyMessageId?: number, callbackId?: string, callbackMessageId?: number, callbackAction?: string): Promise<{ session: PrintWizardSession | null; required: boolean; duplicate: boolean }> {
  const response = await getPrintWizardStub(env, userId).fetch("https://telegram-print/next", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value, replyMessageId, callbackId, callbackMessageId, callbackAction }),
  });
  if (response.status === 400) return { session: null, required: true, duplicate: false };
  if (!response.ok) { console.warn("Telegram print wizard next failed", response.status); return { session: null, required: false, duplicate: false }; }
  const result = await response.json<{ session: PrintWizardSession; duplicate?: boolean }>();
  return { session: result.session, required: false, duplicate: result.duplicate === true };
}

async function claimPrintWizardConfirmation(env: TelegramEnvironment, userId: number, callbackId: string, callbackMessageId: number, callbackAction: string) {
  const response = await getPrintWizardStub(env, userId).fetch("https://telegram-print/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callbackId, callbackMessageId, callbackAction }),
  });
  if (!response.ok) { console.warn("Telegram print wizard confirmation failed", response.status); return null; }
  return response.json<{ session: PrintWizardSession; duplicate?: boolean }>();
}
async function clearPrintWizard(env: TelegramEnvironment, userId: number) {
  const response = await getPrintWizardStub(env, userId).fetch("https://telegram-print/session", { method: "DELETE" });
  if (!response.ok) console.warn("Telegram print wizard clear failed", response.status);
}

async function recordPrintWizardPrompt(env: TelegramEnvironment, userId: number, messageId: number, expectedStep: number) {
  const response = await getPrintWizardStub(env, userId).fetch("https://telegram-print/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, expectedStep }),
  });
  if (!response.ok) console.warn("Telegram print wizard prompt tracking failed", response.status);
}

function getPrintWizardKeyboard(required: boolean): TelegramKeyboard {
  const cancel = { text: "\ucde8\uc18c", callback_data: "print:cancel" };
  return required ? [[cancel]] : [[{ text: "\uac74\ub108\ub6f0\uae30", callback_data: "print:skip" }, cancel]];
}

function getPrintWizardSummary(session: PrintWizardSession) {
  const details = printWizardFields.map((field) => `${field.label}: ${session.values[field.key] || "-"}`).join("\n");
  return `\uc785\ub825 \ub0b4\uc6a9\uc744 \ud655\uc778\ud574 \uc8fc\uc138\uc694.\n\n${details}`;
}

async function sendPrintWizardPrompt(env: TelegramEnvironment, target: TelegramReplyTarget, session: PrintWizardSession) {
  const field = printWizardFields[session.step];
  const messageId = !field
    ? await sendTelegramMessage(env, target, getPrintWizardSummary(session), [[{ text: "\uc800\uc7a5", callback_data: "print:confirm" }, { text: "\ucde8\uc18c", callback_data: "print:cancel" }]])
    : await sendTelegramMessage(env, target, `[${field.label}] ${field.hint}`, getPrintWizardKeyboard(field.required));
  if (messageId !== null) await recordPrintWizardPrompt(env, session.userId, messageId, session.step);
}

async function processPrintWizardCallback(env: TelegramEnvironment, update: TelegramUpdate): Promise<string | null> {
  const callback = update.callback_query;
  const target = callback?.message;
  if (!callback || !target || !callback.data?.startsWith("print:")) return null;
  await answerTelegramCallback(env, callback.id);
  if (String(callback.from.id) !== env.TELEGRAM_ALLOWED_USER_ID) return "ignored";

  const session = await readPrintWizardSession(env, callback.from.id);
  if (!session || session.chatId !== target.chat.id) return "ignored";
  if (callback.data === "print:cancel") {
    await clearPrintWizard(env, callback.from.id);
    await sendTelegramMessage(env, target, "\ucd9c\ub825 \uc791\uc5c5 \uc791\uc131\uc744 \ucde8\uc18c\ud588\uc2b5\ub2c8\ub2e4.");
    return "wizard_cancelled";
  }
  if (callback.data === "print:skip") {
    if (session.lastPromptMessageId !== target.message_id) return "ignored";
    const field = printWizardFields[session.step];
    if (!field || field.required) { await sendPrintWizardPrompt(env, target, session); return "wizard_required"; }
    const advanced = await advancePrintWizard(env, callback.from.id, "", undefined, callback.id, target.message_id, callback.data);
    if (!advanced.duplicate && advanced.session) await sendPrintWizardPrompt(env, target, advanced.session);
    return advanced.duplicate ? "wizard_duplicate" : "wizard_advanced";
  }
  if (callback.data !== "print:confirm" || session.step < printWizardFields.length || session.lastPromptMessageId !== target.message_id) return "ignored";
  const printJob = buildPrintJob(session.values);
  if ("error" in printJob) { await sendTelegramMessage(env, target, printUsage(printJob.error)); return "command_error"; }
  const confirmation = await claimPrintWizardConfirmation(env, callback.from.id, callback.id, target.message_id, callback.data);
  if (!confirmation || confirmation.duplicate) return confirmation?.duplicate ? "wizard_duplicate" : "wizard_error";
  const sourceMessage: TelegramMessage = { message_id: session.sourceMessageId, text: "/print", chat: { id: session.chatId }, from: { id: session.userId } };
  const result = await saveTelegramPrintJob(env, update, sourceMessage, printJob.body, printJob.dueAt, printJob.properties);
  return result.result;
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
      return { error: "필드 이름을 입력해 주세요." };
    }

    const key = keyMatch[0];
    index += key.length;

    if (input[index] !== "=") {
      return { error: `\"${key}\" 뒤에 =을 입력해 주세요.` };
    }

    if (!printCommandKeys.has(key)) {
      return { error: `지원하지 않는 필드입니다: ${key}` };
    }

    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return { error: `같은 필드를 두 번 입력할 수 없습니다: ${key}` };
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
            return { error: "따옴표 안의 이스케이프 표기가 끝나지 않았습니다." };
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
        return { error: "따옴표로 묶은 값이 닫히지 않았습니다." };
      }

      if (index < input.length && !/\s/.test(input[index])) {
        return { error: "각 필드는 공백으로 구분해 주세요." };
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
    return { error: "출력물(item)은 필수입니다." };
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
    return { error: field === "grams" ? "무게(grams)는 0 이상의 숫자로 입력해 주세요." : "금액(price)은 0 이상의 숫자로 입력해 주세요." };
  }

  return { value: number };
}

function parseDueAt(value: string | undefined): ParseResult<string | null> {
  if (value === undefined || !value.trim()) {
    return { value: null };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: "날짜(date)는 YYYY-MM-DD 형식으로 입력해 주세요." };
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { error: "유효하지 않은 날짜(date)입니다." };
  }

  return { value: date.toISOString() };
}

const printColorAliases: Record<string, string> = {
  "\ud770": "white", "\ud770\uc0c9": "white", "\ud654\uc774\ud2b8": "white", white: "white",
  "\uac80": "black", "\uac80\uc815": "black", "\uac80\uc740\uc0c9": "black", black: "black",
  "\ubbfc\ud2b8": "mint", "\ubbfc\ud2b8\uc0c9": "mint", mint: "mint",
  "\ube68": "red", "\ube68\uac15": "red", "\ube68\uac04\uc0c9": "red", red: "red",
};

function normalizePrintColors(value: string | undefined) {
  if (!value) return [];
  return value.split(/[\s,\/|]+/).map((color) => color.trim()).filter(Boolean)
    .map((color) => printColorAliases[color.toLowerCase()] ?? color);
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

  const status = values.status?.trim() || "missing";
  if (!queueStatuses.has(status as PrintJobProperties["queue_status"])) {
    return { error: "상태(status)는 missing(미상), waiting(대기), printing(출력 중), done(완료), paused(보류) 중 하나여야 합니다." };
  }

  return {
    body: values.item.trim(),
    dueAt: dueAt.value,
    properties: {
      customer: values.customer?.trim() ?? "",
      colors: normalizePrintColors(values.colors),
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
  return `출력 작업을 만들지 못했습니다.\n${error}\n\n예시:\n/print item="케이스" customer="홍길동" colors="black,white" grams=250 price=5000 payment=paid status=missing date=2026-09-03 model="https://..." note="급함"\n\n출력물(item)은 필수이며, 나머지 필드는 선택입니다.`;
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
  await sendTelegramMessage(env, message, `Print Queue에 출력 작업을 추가했습니다: ${body}`);
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
  const callbackResult = await processPrintWizardCallback(env, update);
  if (callbackResult) return callbackResult;
  const message = getTelegramMessage(update);
  if (!message || String(message.from.id) !== env.TELEGRAM_ALLOWED_USER_ID) return "ignored";
  const printArguments = getPrintCommandArguments(message.text);
  if (printArguments === "") {
    const session = await startPrintWizard(env, message);
    if (!session) {
      await sendTelegramMessage(env, message, "\ucd9c\ub825 \uc791\uc5c5 \uc785\ub825\uc744 \uc2dc\uc791\ud558\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.");
      return "wizard_error";
    }
    await sendPrintWizardPrompt(env, message, session);
    return "wizard_started";
  }
  const activeWizard = await readPrintWizardSession(env, message.from.id);
  if (activeWizard && printArguments === null) {
    if (message.text === "/cancel") {
      await clearPrintWizard(env, message.from.id);
      await sendTelegramMessage(env, message, "\ucd9c\ub825 \uc791\uc5c5 \uc791\uc131\uc744 \ucde8\uc18c\ud588\uc2b5\ub2c8\ub2e4.");
      return "wizard_cancelled";
    }
    const isReplyToCurrentPrompt = message.reply_to_message?.message_id === activeWizard.lastPromptMessageId;
    if (!message.text.startsWith("/") && isReplyToCurrentPrompt) {
      const advanced = await advancePrintWizard(env, message.from.id, message.text, message.message_id);
      if (advanced.required) {
        await sendTelegramMessage(env, message, "\ud544\uc218 \uc785\ub825 \ud56d\ubaa9\uc785\ub2c8\ub2e4. \ub0b4\uc6a9\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694.");
        await sendPrintWizardPrompt(env, message, activeWizard);
        return "wizard_required";
      }
      if (!advanced.session) {
        await sendTelegramMessage(env, message, "\ucd9c\ub825 \uc791\uc5c5 \uc785\ub825\uc744 \uc9c4\ud589\ud558\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.");
        return "wizard_error";
      }
      if (!advanced.duplicate) await sendPrintWizardPrompt(env, message, advanced.session);
      return advanced.duplicate ? "wizard_duplicate" : "wizard_advanced";
    }
    if (message.text.startsWith("/")) {
      await sendTelegramMessage(env, message, "\uc9c4\ud589 \uc911\uc778 \ucd9c\ub825 \uc791\uc5c5\uc744 \uc644\ub8cc\ud558\uac70\ub098 /cancel\ub85c \ucde8\uc18c\ud574 \uc8fc\uc138\uc694.");
      return "wizard_waiting";
    }
  }
  if (printArguments !== null) {
    if (activeWizard) await clearPrintWizard(env, message.from.id);
    const parsedArguments = parsePrintCommandArguments(printArguments);
    if ("error" in parsedArguments) { await sendTelegramMessage(env, message, printUsage(parsedArguments.error)); return "command_error"; }
    const printJob = buildPrintJob(parsedArguments.values);
    if ("error" in printJob) { await sendTelegramMessage(env, message, printUsage(printJob.error)); return "command_error"; }
    return (await saveTelegramPrintJob(env, update, message, printJob.body, printJob.dueAt, printJob.properties)).result;
  }
  if (message.text.startsWith("/")) return "ignored";
  return saveTelegramInboxItem(env, update, message);
}
