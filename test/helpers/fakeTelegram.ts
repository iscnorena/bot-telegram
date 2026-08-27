import { vi } from "vitest";

/**
 * Doble de `telegramService`. Ninguna llamada real de red.
 * `config.fallarSendDocument` fuerza el camino de reversión en `entregar` /
 * `entregarConEnvio` (aplica tanto a `sendDocument` como a `sendDocumentBinary`).
 */
export const config = { fallarSendDocument: false };

export const fakeTelegram = {
  sendMessage: vi.fn(async (_args: { chatId: unknown; text: string }) => {}),
  sendDocument: vi.fn(
    async (args: { chatId: unknown; fileId: string; caption?: string }) => {
      if (config.fallarSendDocument) {
        throw new Error("Telegram sendDocument falló (simulado)");
      }
      return `${args.fileId}::reenviado`;
    },
  ),
  sendDocumentBinary: vi.fn(
    async (args: {
      chatId: unknown;
      file: Blob;
      filename: string;
      caption?: string;
    }) => {
      if (config.fallarSendDocument) {
        throw new Error("Telegram sendDocument (binario) falló (simulado)");
      }
      return `binario::${args.filename}::file_id`;
    },
  ),
  notificarAdmin: vi.fn(async (_text: string) => {}),
};

export function resetFakeTelegram(): void {
  config.fallarSendDocument = false;
  fakeTelegram.sendMessage.mockClear();
  fakeTelegram.sendDocument.mockClear();
  fakeTelegram.sendDocumentBinary.mockClear();
  fakeTelegram.notificarAdmin.mockClear();
}
