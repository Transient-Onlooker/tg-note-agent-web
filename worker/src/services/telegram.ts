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

async function findTelegramCapture(
  env: TelegramEnvironment,
  chatId: string,
  messageId: string,
) {
  return env.DB
    .prepare(`
      SELECT id
      FROM captures
      WHERE source = 'telegram'
        AND source_chat_id = ?
        AND source_message_id = ?
      LIMIT 1
    `)
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
              emoji: "👍",
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

function getSupportedMessage(
  update: TelegramUpdate,
): TelegramMessage | null {
  const message = update.message;

  if (!message || !message.from || typeof message.text !== "string") {
    return null;
  }

  const text = message.text.trim();

  if (!text || text.startsWith("/")) {
    return null;
  }

  return {
    ...message,
    from: message.from,
    text,
  };
}

export async function processTelegramUpdate(
  env: TelegramEnvironment,
  update: TelegramUpdate,
) {
  const message = getSupportedMessage(update);

  if (!message || String(message.from.id) !== env.TELEGRAM_ALLOWED_USER_ID) {
    return "ignored";
  }

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
        .prepare(`
          INSERT INTO captures (
            id,
            source,
            source_chat_id,
            source_message_id,
            source_user_id,
            raw_text,
            raw_payload_json,
            created_at
          )
          VALUES (?, 'telegram', ?, ?, ?, ?, ?, ?)
        `)
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
