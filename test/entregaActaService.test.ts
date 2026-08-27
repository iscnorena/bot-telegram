import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const mod = await import("./helpers/fakePrisma");
  return { prisma: mod.fakePrisma };
});
vi.mock("@/lib/services/telegramService", async () => {
  const mod = await import("./helpers/fakeTelegram");
  return { telegramService: mod.fakeTelegram };
});

import {
  entregar,
  entregarConEnvio,
  marcarNoEncontrado,
} from "@/lib/services/entregaActaService";
import { acciones, estadoDe, resetStore, store } from "./helpers/fakePrisma";
import { config, fakeTelegram, resetFakeTelegram } from "./helpers/fakeTelegram";

beforeEach(() => {
  resetStore();
  resetFakeTelegram();
});

describe("entregar", () => {
  it("entrega exitosa: pasa a entregado, guarda file_id, loguea y notifica admin", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor", chatIdUsuario: 999n }]);

    const res = await entregar(s.id, "FID-1", "telegram_proveedor");

    expect(res).toBe(true);
    expect(estadoDe(s.id)).toBe("entregado");
    const row = store.rows.get(s.id)!;
    expect(row.fileIdEntregado).toBe("FID-1::reenviado");
    expect(row.metodoEntrega).toBe("telegram_proveedor");
    expect(row.entregadoAt).toBeInstanceOf(Date);
    expect(acciones(s.id)).toContain("entrega");
    expect(fakeTelegram.sendDocument).toHaveBeenCalledTimes(1);
    expect(fakeTelegram.notificarAdmin).toHaveBeenCalledTimes(1);
  });

  it.each(["entregado", "no_encontrado"])(
    "solicitud ya cerrada (%s): devuelve false, no envía y loguea entrega_rechazada",
    async (estado) => {
      const [s] = resetStore([{ estado }]);

      const res = await entregar(s.id, "FID", "telegram_proveedor");

      expect(res).toBe(false);
      expect(estadoDe(s.id)).toBe(estado);
      expect(acciones(s.id)).toContain("entrega_rechazada");
      expect(fakeTelegram.sendDocument).not.toHaveBeenCalled();
    },
  );

  it("condición de carrera: dos entregas concurrentes, solo una gana", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor" }]);

    const resultados = await Promise.all([
      entregar(s.id, "F1", "telegram_proveedor"),
      entregar(s.id, "F2", "telegram_proveedor"),
    ]);

    expect(resultados.filter(Boolean)).toHaveLength(1);
    expect(resultados.filter((r) => !r)).toHaveLength(1);
    expect(estadoDe(s.id)).toBe("entregado");
    expect(fakeTelegram.sendDocument).toHaveBeenCalledTimes(1);
    expect(acciones(s.id)).toContain("entrega_rechazada");
  });

  it("fallo de sendDocument desde enviado_proveedor: revierte a enviado_proveedor", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor" }]);
    config.fallarSendDocument = true;

    const res = await entregar(s.id, "FID", "telegram_proveedor");

    expect(res).toBe(false);
    expect(estadoDe(s.id)).toBe("enviado_proveedor");
    expect(acciones(s.id)).toContain("error");
  });

  it("fallo de sendDocument desde no_encontrado_proveedor: revierte a no_encontrado_proveedor (no a enviado_proveedor)", async () => {
    const [s] = resetStore([{ estado: "no_encontrado_proveedor" }]);
    config.fallarSendDocument = true;

    const res = await entregar(s.id, "FID", "telegram_proveedor");

    expect(res).toBe(false);
    expect(estadoDe(s.id)).toBe("no_encontrado_proveedor");
    expect(acciones(s.id)).toContain("error");
  });

  it("entregarConEnvio: si el callback `enviar` lanza desde no_encontrado_proveedor, revierte a ese estado", async () => {
    const [s] = resetStore([{ estado: "no_encontrado_proveedor" }]);

    const res = await entregarConEnvio(s.id, "panel_web", async () => {
      throw new Error("fallo de red simulado");
    });

    expect(res).toBe(false);
    expect(estadoDe(s.id)).toBe("no_encontrado_proveedor");
    expect(acciones(s.id)).toContain("error");
  });

  it("entregarConEnvio: éxito setea proveedorId y metodoEntrega", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor" }]);

    const res = await entregarConEnvio(
      s.id,
      "panel_web",
      async () => "fid-xyz",
      { proveedorId: 42 },
    );

    expect(res).toBe(true);
    expect(estadoDe(s.id)).toBe("entregado");
    const row = store.rows.get(s.id)!;
    expect(row.metodoEntrega).toBe("panel_web");
    expect(row.proveedorId).toBe(42);
    expect(row.fileIdEntregado).toBe("fid-xyz");
  });
});

describe("marcarNoEncontrado", () => {
  it("esFinal=false: pasa a no_encontrado_proveedor, sin aviso al usuario ni al admin", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor" }]);

    const res = await marcarNoEncontrado(s.id, "telegram_proveedor", false);

    expect(res).toBe(true);
    expect(estadoDe(s.id)).toBe("no_encontrado_proveedor");
    expect(acciones(s.id)).toContain("no_encontrado");
    expect(fakeTelegram.sendMessage).not.toHaveBeenCalled();
    expect(fakeTelegram.notificarAdmin).not.toHaveBeenCalled();
  });

  it("esFinal=true: pasa a no_encontrado, avisa al usuario y al admin", async () => {
    const [s] = resetStore([{ estado: "enviado_proveedor", chatIdUsuario: 777n }]);

    const res = await marcarNoEncontrado(s.id, "telegram_proveedor", true);

    expect(res).toBe(true);
    expect(estadoDe(s.id)).toBe("no_encontrado");
    expect(fakeTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(fakeTelegram.notificarAdmin).toHaveBeenCalledTimes(1);
  });

  it("esFinal=false sobre una solicitud ya en no_encontrado_proveedor: devuelve false", async () => {
    const [s] = resetStore([{ estado: "no_encontrado_proveedor" }]);

    const res = await marcarNoEncontrado(s.id, "telegram_proveedor", false);

    expect(res).toBe(false);
    expect(estadoDe(s.id)).toBe("no_encontrado_proveedor");
    expect(acciones(s.id)).toContain("entrega_rechazada");
  });
});
