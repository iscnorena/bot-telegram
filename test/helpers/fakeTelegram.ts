import { vi } from "vitest";

/**
 * Doble de `telegramService`. Ninguna llamada real de red.
 * `config.fallarSendDocument` fuerza el camino de reversión en `entregar`.
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
  sendDocumentForm: vi.fn(async (_form: FormData) => "form::reenviado"),
  notificarAdmin: vi.fn(async (_text: string) => {}),
};

export function resetFakeTelegram(): void {
  config.fallarSendDocument = false;
  fakeTelegram.sendMessage.mockClear();
  fakeTelegram.sendDocument.mockClear();
  fakeTelegram.sendDocumentForm.mockClear();
  fakeTelegram.notificarAdmin.mockClear();
}
