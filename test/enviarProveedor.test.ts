import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const mod = await import("./helpers/fakePrisma");
  return { prisma: mod.fakePrisma };
});
vi.mock("@/lib/services/telegramService", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/services/telegramService")>();
  const mod = await import("./helpers/fakeTelegram");
  return { ...actual, telegramService: mod.fakeTelegram };
});

import { enviarAProveedor } from "@/lib/services/solicitudService";
import { acciones, estadoDe, resetStore } from "./helpers/fakePrisma";
import { fakeTelegram, resetFakeTelegram } from "./helpers/fakeTelegram";

beforeEach(() => {
  resetStore();
  resetFakeTelegram();
});

describe("enviarAProveedor (puente admin)", () => {
  it("de 'pendiente_curp' pasa a 'enviado_proveedor' y avisa al proveedor", async () => {
    const [s] = resetStore([{ estado: "pendiente_curp", curp: "NORC900101HDFRXX09" }]);

    const ok = await enviarAProveedor(s.id);

    expect(ok).toBe(true);
    expect(estadoDe(s.id)).toBe("enviado_proveedor");
    expect(acciones(s.id)).toContain("notificacion_proveedor");
    expect(
      fakeTelegram.sendMessage.mock.calls.some(
        (c) => String((c[0] as { chatId: unknown }).chatId) === "1000",
      ),
    ).toBe(true); // PROVEEDOR_TELEGRAM_CHAT_ID de test
  });

  it("sobre una solicitud ya enviada devuelve false", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor" }]);
    expect(await enviarAProveedor(s.id)).toBe(false);
  });
});
