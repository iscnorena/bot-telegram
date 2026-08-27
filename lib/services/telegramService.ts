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

export const telegramService = {
  async sendMessage(args: { chatId: ChatId; text: string }): Promise<void> {
    await callJson("sendMessage", {
      chat_id: toChatId(args.chatId),
      text: args.text,
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
   * Variante pass-through para el panel web (subida `multipart/form-data`).
   * El endpoint que lo usa está fuera de alcance, pero el método existe.
   * El `FormData` debe traer al menos `chat_id` y `document`.
   */
  async sendDocumentForm(form: FormData): Promise<string> {
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
