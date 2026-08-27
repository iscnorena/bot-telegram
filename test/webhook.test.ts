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

import { POST } from "@/app/api/telegram/webhook/route";
import { estadoDe, resetStore, store } from "./helpers/fakePrisma";
import { fakeTelegram, resetFakeTelegram } from "./helpers/fakeTelegram";

const SECRET = "test-secret";
const PROVEEDOR = 1000;

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": SECRET,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** Último texto enviado al proveedor por `sendMessage`. */
function ultimoAck(): string | undefined {
  const call = fakeTelegram.sendMessage.mock.calls.at(-1);
  return call?.[0]?.text;
}

beforeEach(() => {
  resetStore();
  resetFakeTelegram();
});

describe("webhook Telegram", () => {
  it("secret inválido: 200 sin efectos", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor" }]);

    const res = await POST(
      req(
        { message: { chat: { id: PROVEEDOR }, document: { file_id: "F" }, caption: String(s.id) } },
        { "x-telegram-bot-api-secret-token": "malo" },
      ),
    );

    expect(res.status).toBe(200);
    expect(estadoDe(s.id)).toBe("enviado_proveedor");
    expect(fakeTelegram.sendDocument).not.toHaveBeenCalled();
  });

  it("documento desde un remitente que no es el proveedor: no dispara entrega", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor" }]);

    const res = await POST(
      req({ message: { chat: { id: 42 }, document: { file_id: "F" }, caption: String(s.id) } }),
    );

    expect(res.status).toBe(200);
    expect(estadoDe(s.id)).toBe("enviado_proveedor");
    expect(fakeTelegram.sendDocument).not.toHaveBeenCalled();
  });

  it("documento con caption vacío: no reenvía, notifica admin y avisa al proveedor", async () => {
    const res = await POST(
      req({ message: { chat: { id: PROVEEDOR }, document: { file_id: "F" } } }),
    );

    expect(res.status).toBe(200);
    expect(fakeTelegram.sendDocument).not.toHaveBeenCalled();
    expect(fakeTelegram.notificarAdmin).toHaveBeenCalledTimes(1);
    expect(fakeTelegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("documento con caption sin match: no reenvía, notifica admin", async () => {
    const res = await POST(
      req({ message: { chat: { id: PROVEEDOR }, document: { file_id: "F" }, caption: "9999" } }),
    );

    expect(res.status).toBe(200);
    expect(fakeTelegram.sendDocument).not.toHaveBeenCalled();
    expect(fakeTelegram.notificarAdmin).toHaveBeenCalledTimes(1);
  });

  it("documento con match por ID: entrega con el file_id del payload", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor", chatIdUsuario: 500n }]);

    const res = await POST(
      req({
        message: { chat: { id: PROVEEDOR }, document: { file_id: "FID-9" }, caption: ` ${s.id} ` },
      }),
    );

    expect(res.status).toBe(200);
    expect(estadoDe(s.id)).toBe("entregado");
    expect(fakeTelegram.sendDocument).toHaveBeenCalledTimes(1);
    expect(fakeTelegram.sendDocument.mock.calls[0][0]).toMatchObject({ fileId: "FID-9" });
  });

  it("documento con match por CURP (1 solicitud abierta): entrega", async () => {
    const [s] = resetStore([
      { estado: "enviado_proveedor", curp: "CURP0000000000AB01" },
    ]);

    const res = await POST(
      req({
        message: {
          chat: { id: PROVEEDOR },
          document: { file_id: "F" },
          caption: "curp0000000000ab01",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(estadoDe(s.id)).toBe("entregado");
  });

  it("documento con match por CURP ambiguo (>1): no reenvía, notifica admin", async () => {
    resetStore([
      { estado: "enviado_proveedor", curp: "CURP0000000000AB01" },
      { estado: "no_encontrado_proveedor", curp: "CURP0000000000AB01" },
    ]);

    const res = await POST(
      req({
        message: {
          chat: { id: PROVEEDOR },
          document: { file_id: "F" },
          caption: "CURP0000000000AB01",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(fakeTelegram.sendDocument).not.toHaveBeenCalled();
    expect(fakeTelegram.notificarAdmin).toHaveBeenCalledTimes(1);
  });

  it("comando 'NO <id>' que resuelve: marca no encontrada y acusa recibo con ✅", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor" }]);

    const res = await POST(req({ message: { chat: { id: PROVEEDOR }, text: `NO ${s.id}` } }));

    expect(res.status).toBe(200);
    expect(estadoDe(s.id)).toBe("no_encontrado_proveedor");
    expect(ultimoAck()).toContain("✅");
  });

  it("comando 'NO 999' (id inexistente): no llama al servicio, ack '⚠️ No encontré'", async () => {
    const res = await POST(req({ message: { chat: { id: PROVEEDOR }, text: "NO 999" } }));

    expect(res.status).toBe(200);
    expect(ultimoAck()).toContain("No encontré");
  });

  it("comando 'NO <id>' sobre solicitud ya entregada: ack de 'sin cambio', sin tocar estado", async () => {
    const [s] = resetStore([{ estado: "entregado" }]);

    const res = await POST(req({ message: { chat: { id: PROVEEDOR }, text: `NO ${s.id}` } }));

    expect(res.status).toBe(200);
    expect(estadoDe(s.id)).toBe("entregado");
    expect(ultimoAck()).toContain("ya está cerrada o en proceso");
  });

  it("comando 'NO abc' (formato inválido): ack '⚠️ Formato no válido', sin tocar la DB", async () => {
    const res = await POST(req({ message: { chat: { id: PROVEEDOR }, text: "NO abc" } }));

    expect(res.status).toBe(200);
    expect(ultimoAck()).toContain("Formato no válido");
    expect(store.logs).toHaveLength(0);
  });

  it("texto normal desde el chat del proveedor: va al flujo de usuario, no a acción de proveedor", async () => {
    const res = await POST(req({ message: { chat: { id: PROVEEDOR }, text: "hola" } }));

    expect(res.status).toBe(200);
    // el flujo de usuario responde algo; no se dispara entrega ni comando NO
    expect(fakeTelegram.sendMessage).toHaveBeenCalled();
    expect(fakeTelegram.sendDocument).not.toHaveBeenCalled();
  });

  it("'/start' desde el chat del proveedor: lo maneja el flujo de usuario", async () => {
    const res = await POST(req({ message: { chat: { id: PROVEEDOR }, text: "/start" } }));

    expect(res.status).toBe(200);
    const ultimo = fakeTelegram.sendMessage.mock.calls.at(-1)?.[0]?.text ?? "";
    expect(ultimo).toContain("gestoría de acta de nacimiento");
  });

  it("mensaje desde un chat que no es el proveedor: flujo de usuario", async () => {
    const res = await POST(req({ message: { chat: { id: 424242 }, text: "/start" } }));

    expect(res.status).toBe(200);
    expect(fakeTelegram.sendMessage).toHaveBeenCalled();
    expect(fakeTelegram.sendDocument).not.toHaveBeenCalled();
  });

  it("body que no es JSON: 400", async () => {
    const bad = new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      body: "no-json{",
    });

    const res = await POST(bad);

    expect(res.status).toBe(400);
  });
});
