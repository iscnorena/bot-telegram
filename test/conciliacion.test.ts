import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const mod = await import("./helpers/fakePrisma");
  return { prisma: mod.fakePrisma };
});

import { tarifaVigente, ponerTarifa } from "@/lib/services/tarifaService";
import {
  capturarFactura,
  cerrarCorte,
  filasDeCorte,
  reabrirCorte,
  totales,
} from "@/lib/services/conciliacionService";
import { semanaDe } from "@/lib/corte";
import {
  resetStore,
  seedTarifas,
  seedUsuarios,
  solicitudDe,
  store,
} from "./helpers/fakePrisma";

const D = (v: string | number) => new Prisma.Decimal(v);
const SEMANA = semanaDe(new Date("2026-08-26T12:00:00Z"));
const dentro = (offsetH = 3) =>
  new Date(SEMANA.inicio.getTime() + offsetH * 3600_000);

beforeEach(() => {
  resetStore();
  seedUsuarios([{ id: 1, nombre: "Proveedor Uno", rol: "proveedor" }]);
});

describe("tarifaService", () => {
  it("tarifaVigente elige la tarifa según la fecha", async () => {
    seedTarifas([
      {
        usuarioId: 1,
        servicioId: 1,
        monto: D("100"),
        vigenteDesde: new Date("2026-01-01"),
        vigenteHasta: new Date("2026-06-01"),
      },
      {
        usuarioId: 1,
        servicioId: 1,
        monto: D("120"),
        vigenteDesde: new Date("2026-06-01"),
        vigenteHasta: null,
      },
    ]);

    expect((await tarifaVigente(1, 1, new Date("2026-03-15")))?.monto.toString()).toBe(
      "100",
    );
    expect((await tarifaVigente(1, 1, new Date("2026-08-01")))?.monto.toString()).toBe(
      "120",
    );
  });

  it("ponerTarifa cierra la vigente y abre la nueva", async () => {
    seedTarifas([
      { usuarioId: 1, servicioId: 1, monto: D("100"), vigenteDesde: new Date("2026-01-01") },
    ]);
    const corte = new Date("2026-09-01");

    await ponerTarifa(1, 1, D("150"), corte);

    expect(store.tarifas).toHaveLength(2);
    const previa = store.tarifas.find((t) => t.monto.toString() === "100")!;
    const nueva = store.tarifas.find((t) => t.monto.toString() === "150")!;
    expect(previa.vigenteHasta?.getTime()).toBe(corte.getTime());
    expect(nueva.vigenteHasta).toBeNull();
    expect(nueva.vigenteDesde.getTime()).toBe(corte.getTime());
  });
});

describe("conciliación de un corte", () => {
  beforeEach(() => {
    resetStore([
      { id: 10, estado: "entregado", proveedorId: 1, servicioId: 1, entregadoAt: dentro(2), metodoEntrega: "telegram_proveedor" },
      { id: 11, estado: "entregado", proveedorId: 1, servicioId: 1, entregadoAt: dentro(5), metodoEntrega: "panel_web" },
      { id: 12, estado: "enviado_proveedor", proveedorId: 1, servicioId: 1, entregadoAt: null },
    ]);
    seedUsuarios([{ id: 1, nombre: "Proveedor Uno", rol: "proveedor" }]);
    seedTarifas([
      { usuarioId: 1, servicioId: 1, monto: D("100"), vigenteDesde: new Date("2026-01-01") },
    ]);
  });

  it("filasDeCorte trae solo las entregadas del rango con su esperado", async () => {
    const filas = await filasDeCorte(SEMANA);
    expect(filas.map((f) => f.solicitudId).sort()).toEqual([10, 11]);
    expect(filas.every((f) => f.esperado?.toString() === "100")).toBe(true);
    expect(filas.every((f) => f.real === null)).toBe(true);
  });

  it("capturarFactura registra el monto y totales calcula el score", async () => {
    expect((await capturarFactura(10, D("110"), 9)).ok).toBe(true);
    expect((await capturarFactura(11, D("100"), 9)).ok).toBe(true);

    const filas = await filasDeCorte(SEMANA);
    const t = totales(filas);
    expect(t.nEntregadas).toBe(2);
    expect(t.nFacturadas).toBe(2);
    expect(t.nSinConciliar).toBe(0);
    expect(t.nConDiferencia).toBe(1); // solo la #10 (110 vs 100)
    expect(t.sumaEsperado.toString()).toBe("200");
    expect(t.sumaReal.toString()).toBe("210");
    expect(t.sumaDiferencia.toString()).toBe("10");
  });

  it("cerrarCorte congela y bloquea; reabrir vuelve a permitir", async () => {
    await capturarFactura(10, D("110"), 9);

    const corte = await cerrarCorte(SEMANA, 9);
    expect(corte.cerradoAt).not.toBeNull();
    expect(corte.cerradoPor).toBe(9);
    expect(Number(corte.totalEsperado)).toBe(200);
    expect(solicitudDe(10)?.corteId).toBe(corte.id);
    expect(solicitudDe(10)?.costoProveedorEsperado?.toString()).toBe("100");

    const bloqueado = await capturarFactura(11, D("90"), 9);
    expect(bloqueado).toEqual({ ok: false, motivo: "corte_cerrado" });

    await reabrirCorte(corte.id, 9);
    expect((await capturarFactura(11, D("90"), 9)).ok).toBe(true);
  });
});
