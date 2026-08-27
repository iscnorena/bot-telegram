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

import { manejarMensajeUsuario } from "@/lib/bot/flujoUsuario";
import {
  conversacionDe,
  estadoDe,
  resetStore,
  solicitudes,
} from "./helpers/fakePrisma";
import { fakeTelegram, resetFakeTelegram } from "./helpers/fakeTelegram";
import { bot } from "@/lib/copy";

const CHAT = 555;
const CURP = "NORC900101HDFRXX09";

function msg(text: string, id = CHAT) {
  return manejarMensajeUsuario({ chat: { id }, text });
}
function ultimo() {
  const c = fakeTelegram.sendMessage.mock.calls.at(-1);
  return (c?.[0] ?? {}) as { text: string; replyMarkup?: unknown };
}

beforeEach(() => {
  resetStore();
  resetFakeTelegram();
});

describe("flujo conversacional del usuario", () => {
  it("/start: responde bienvenida con teclado y deja la conversación en 'menu'", async () => {
    await msg("/start");
    expect(ultimo().text).toBe(bot.bienvenida);
    expect(ultimo().replyMarkup).toMatchObject({ keyboard: expect.any(Array) });
    expect(conversacionDe(CHAT)?.paso).toBe("menu");
  });

  it("botón 'Iniciar trámite': pasa a 'esperando_curp' y pide la CURP", async () => {
    await msg("/start");
    await msg(bot.menu.iniciar);
    expect(conversacionDe(CHAT)?.paso).toBe("esperando_curp");
    expect(ultimo().text).toBe(bot.pedirCurp);
    expect(ultimo().replyMarkup).toMatchObject({ remove_keyboard: true });
  });

  it("CURP inválida 3 veces: vuelve al menú", async () => {
    await msg("/start");
    await msg(bot.menu.iniciar);
    await msg("no-es-curp");
    expect(conversacionDe(CHAT)?.intentos).toBe(1);
    await msg("tampoco");
    expect(conversacionDe(CHAT)?.intentos).toBe(2);
    await msg("sigue-mal");
    expect(conversacionDe(CHAT)?.paso).toBe("menu");
    expect(ultimo().text).toBe(bot.curpReintentosAgotados);
  });

  it("CURP válida (en minúsculas): crea la solicitud en 'pendiente_curp' y confirma", async () => {
    await msg("/start");
    await msg(bot.menu.iniciar);
    await msg(CURP.toLowerCase());

    const s = solicitudes();
    expect(s).toHaveLength(1);
    expect(s[0].curp).toBe(CURP);
    expect(s[0].estado).toBe("pendiente_curp");
    expect(s[0].chatIdUsuario).toBe(BigInt(CHAT));
    expect(ultimo().text).toContain(`#${s[0].id}`);
    expect(conversacionDe(CHAT)?.paso).toBe("menu");
    expect(conversacionDe(CHAT)?.solicitudId).toBe(s[0].id);
  });

  it("/simular_pago: envía la solicitud al proveedor y avisa al usuario", async () => {
    const [s] = resetStore([
      { chatIdUsuario: BigInt(CHAT), curp: CURP, estado: "pendiente_curp" },
    ]);

    await msg("/simular_pago");

    expect(estadoDe(s.id)).toBe("enviado_proveedor");
    expect(
      fakeTelegram.sendMessage.mock.calls.some(
        (c) => String((c[0] as { chatId: unknown }).chatId) === "1000",
      ),
    ).toBe(true); // notificación al PROVEEDOR_TELEGRAM_CHAT_ID de test
    expect(ultimo().text).toBe(bot.pagoConfirmado(s.id));
  });

  it("/simular_pago sin solicitud pendiente: lo dice y no falla", async () => {
    await msg("/simular_pago");
    expect(ultimo().text).toBe(bot.sinSolicitudParaPago);
  });

  it("Consultar estado con CURP propia: muestra el estado", async () => {
    const [s] = resetStore([
      { chatIdUsuario: BigInt(CHAT), curp: CURP, estado: "entregado" },
    ]);

    await msg("/start");
    await msg(bot.menu.consultar);
    await msg(CURP);

    expect(ultimo().text).toBe(
      bot.consultaEstado(s.id, bot.estadoLegible("entregado")),
    );
    expect(conversacionDe(CHAT)?.paso).toBe("menu");
  });

  it("Consultar estado con CURP de otro chat: sin resultados (privacidad)", async () => {
    resetStore([{ chatIdUsuario: 999n, curp: CURP, estado: "entregado" }]);

    await msg("/start");
    await msg(bot.menu.consultar);
    await msg(CURP);

    expect(ultimo().text).toBe(bot.consultaSinResultados);
  });

  it("texto no reconocido en el menú: responde 'no te entendí'", async () => {
    await msg("/start");
    await msg("bla bla bla");
    expect(ultimo().text).toBe(bot.noEntiendo);
  });
});
