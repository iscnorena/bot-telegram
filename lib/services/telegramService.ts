import { env } from "@/lib/env";

/**
 * Wrapper mínimo de la Telegram Bot API con `fetch` nativo.
 *
 * Reglas de arquitectura:
 * - NO existe método de descarga de archivos (`getFile` + binario): ningún flujo
 *   lo usa. Las entregas se hacen reenviando el `file_id` servidor-a-servidor.
 * - Cada método lanza si Telegram responde `ok: false`, con `description` en el
 *   mensaje, para que la capa de negocio lo capture y revierta estado.
 */

/** Se resuelve por llamada (no al importar) para no forzar la validación de env en build. */
function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
}

type ChatId = string | number | bigint;

/** Evita el throw de `JSON.stringify` sobre `BigInt`. */
function toChatId(v: ChatId): string | number {
  return typeof v === "bigint" ? v.toString() : v;
}

async function callJson<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap<T>(method, res);
}

async function callForm<T = unknown>(
  method: string,
  form: FormData,
): Promise<T> {
  const res = await fetch(apiUrl(method), { method: "POST", body: form });
  return unwrap<T>(method, res);
}

async function unwrap<T>(method: string, res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string }
    | null;
  if (!data || data.ok !== true) {
    throw new Error(
      `Telegram ${method} falló (${res.status}): ${data?.description ?? "respuesta no válida"}`,
    );
  }
  return data.result as T;
}

interface TelegramMessage {
  message_id: number;
  document?: { file_id: string; file_unique_id: string };
}

/** ReplyKeyboardMarkup con las opciones del menú del bot. */
export function tecladoMenu(): unknown {
  return {
    keyboard: [
      [{ text: "📄 Iniciar trámite de gestoría" }],
      [{ text: "🔎 Consultar estado" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** Quita el teclado (para pasos donde se espera texto libre, p. ej. la CURP). */
export function quitarTeclado(): unknown {
  return { remove_keyboard: true };
}

export const telegramService = {
  async sendMessage(args: {
    chatId: ChatId;
    text: string;
    replyMarkup?: unknown;
    parseMode?: "Markdown" | "MarkdownV2" | "HTML";
  }): Promise<void> {
    await callJson("sendMessage", {
      chat_id: toChatId(args.chatId),
      text: args.text,
      ...(args.parseMode ? { parse_mode: args.parseMode } : {}),
      ...(args.replyMarkup ? { reply_markup: args.replyMarkup } : {}),
    });
  },

  /**
   * Reenvía un documento por `file_id` (server-to-server, no pasa por el backend).
   * Devuelve el `file_id` del documento tal como quedó tras el envío.
   */
  async sendDocument(args: {
    chatId: ChatId;
    fileId: string;
    caption?: string;
  }): Promise<string> {
    const msg = await callJson<TelegramMessage>("sendDocument", {
      chat_id: toChatId(args.chatId),
      document: args.fileId,
      ...(args.caption ? { caption: args.caption } : {}),
    });
    return msg.document?.file_id ?? args.fileId;
  },

  /**
   * Pass-through para el panel web: recibe el binario (un `Blob`/`File`) y lo
   * reenvía como `multipart/form-data` a `sendDocument`. El binario NO se
   * persiste en ningún lado. Devuelve el `file_id` que Telegram asigna.
   */
  async sendDocumentBinary(args: {
    chatId: ChatId;
    file: Blob;
    filename: string;
    caption?: string;
  }): Promise<string> {
    const form = new FormData();
    form.append("chat_id", String(toChatId(args.chatId)));
    form.append("document", args.file, args.filename);
    if (args.caption) form.append("caption", args.caption);
    const msg = await callForm<TelegramMessage>("sendDocument", form);
    return msg.document?.file_id ?? "";
  },

  async notificarAdmin(text: string): Promise<void> {
    await telegramService.sendMessage({
      chatId: env.ADMIN_TELEGRAM_CHAT_ID,
      text,
    });
  },
};

export type TelegramService = typeof telegramService;
