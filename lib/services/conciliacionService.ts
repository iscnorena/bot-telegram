import { Prisma, type Corte } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Semana } from "@/lib/corte";
import { tarifaVigente } from "@/lib/services/tarifaService";
import { servicioPorDefecto } from "@/lib/services/servicioService";

const CERO = new Prisma.Decimal(0);

export interface FilaConciliacion {
  solicitudId: number;
  entregadoAt: Date;
  curp: string;
  canal: string | null;
  proveedorId: number | null;
  proveedorNombre: string | null;
  servicioNombre: string;
  esperado: Prisma.Decimal | null;
  real: Prisma.Decimal | null;
  diferencia: Prisma.Decimal | null; // real - esperado (>0 = el proveedor cobra de más)
  bloqueada: boolean; // pertenece a un corte cerrado
}

export interface TotalesConciliacion {
  nEntregadas: number;
  nFacturadas: number;
  nSinConciliar: number;
  nConDiferencia: number;
  sumaEsperado: Prisma.Decimal;
  sumaReal: Prisma.Decimal;
  sumaDiferencia: Prisma.Decimal;
}

export interface ResumenSemana {
  corte: Corte | null;
  cerrado: boolean;
  nEntregadas: number;
  nSinConciliar: number;
  sumaEsperado: Prisma.Decimal | null;
  sumaReal: Prisma.Decimal | null;
  sumaDiferencia: Prisma.Decimal | null;
}

export function corteDeSemana(s: Semana): Promise<Corte | null> {
  return prisma.corte.findUnique({
    where: { inicio_fin: { inicio: s.inicio, fin: s.fin } },
  });
}

/** Filas detalladas de un corte: una por solicitud entregada en el rango. */
export async function filasDeCorte(s: Semana): Promise<FilaConciliacion[]> {
  const servicioDefault = await servicioPorDefecto();
  const solicitudes = await prisma.solicitud.findMany({
    where: {
      estado: "entregado",
      entregadoAt: { gte: s.inicio, lte: s.fin },
    },
    include: { proveedor: true, servicio: true, corte: true },
    orderBy: { entregadoAt: "asc" },
  });

  const filas: FilaConciliacion[] = [];
  for (const sol of solicitudes) {
    const servicioId = sol.servicioId ?? servicioDefault.id;
    let esperado = sol.costoProveedorEsperado ?? null;
    if (esperado === null && sol.proveedorId && sol.entregadoAt) {
      const t = await tarifaVigente(sol.proveedorId, servicioId, sol.entregadoAt);
      esperado = t?.monto ?? null;
    }
    const real = sol.costoProveedorReal ?? null;
    const diferencia =
      real !== null && esperado !== null ? real.minus(esperado) : null;

    filas.push({
      solicitudId: sol.id,
      entregadoAt: sol.entregadoAt!,
      curp: sol.curp,
      canal: sol.metodoEntrega,
      proveedorId: sol.proveedorId,
      proveedorNombre: sol.proveedor?.nombre ?? null,
      servicioNombre: sol.servicio?.nombre ?? servicioDefault.nombre,
      esperado,
      real,
      diferencia,
      bloqueada: !!sol.corte?.cerradoAt,
    });
  }
  return filas;
}

export function totales(filas: FilaConciliacion[]): TotalesConciliacion {
  let sumaEsperado = CERO;
  let sumaReal = CERO;
  let sumaDiferencia = CERO;
  let nFacturadas = 0;
  let nConDiferencia = 0;

  for (const f of filas) {
    if (f.esperado) sumaEsperado = sumaEsperado.plus(f.esperado);
    if (f.real !== null) {
      sumaReal = sumaReal.plus(f.real);
      nFacturadas++;
    }
    if (f.diferencia !== null) {
      sumaDiferencia = sumaDiferencia.plus(f.diferencia);
      if (!f.diferencia.isZero()) nConDiferencia++;
    }
  }

  return {
    nEntregadas: filas.length,
    nFacturadas,
    nSinConciliar: filas.length - nFacturadas,
    nConDiferencia,
    sumaEsperado,
    sumaReal,
    sumaDiferencia,
  };
}

/** Versión ligera para la lista de semanas (evita recalcular tarifas de semanas viejas). */
export async function resumenSemana(s: Semana): Promise<ResumenSemana> {
  const corte = await corteDeSemana(s);
  if (corte?.cerradoAt) {
    return {
      corte,
      cerrado: true,
      nEntregadas: corte.totalEntregadas ?? 0,
      nSinConciliar: 0,
      sumaEsperado: corte.totalEsperado,
      sumaReal: corte.totalReal,
      sumaDiferencia: corte.totalDiferencia,
    };
  }
  const enRango = {
    estado: "entregado" as const,
    entregadoAt: { gte: s.inicio, lte: s.fin },
  };
  const nEntregadas = await prisma.solicitud.count({ where: enRango });
  const nFacturadas = await prisma.solicitud.count({
    where: { ...enRango, costoProveedorReal: { not: null } },
  });
  const agg = await prisma.solicitud.aggregate({
    where: { ...enRango, costoProveedorReal: { not: null } },
    _sum: { costoProveedorReal: true },
  });
  return {
    corte,
    cerrado: false,
    nEntregadas,
    nSinConciliar: nEntregadas - nFacturadas,
    sumaEsperado: null,
    sumaReal: agg._sum.costoProveedorReal ?? CERO,
    sumaDiferencia: null,
  };
}

type Resultado = { ok: true } | { ok: false; motivo: string };

async function corteCerradoDe(solicitudId: number): Promise<boolean> {
  const sol = await prisma.solicitud.findUnique({
    where: { id: solicitudId },
    select: { corte: { select: { cerradoAt: true } } },
  });
  return !!sol?.corte?.cerradoAt;
}

/** Captura manual del monto que el proveedor factura por ese trámite. */
export async function capturarFactura(
  solicitudId: number,
  monto: Prisma.Decimal,
  adminId: number,
): Promise<Resultado> {
  const sol = await prisma.solicitud.findUnique({
    where: { id: solicitudId },
    select: { estado: true, corte: { select: { cerradoAt: true } } },
  });
  if (!sol) return { ok: false, motivo: "inexistente" };
  if (sol.estado !== "entregado") return { ok: false, motivo: "no_entregada" };
  if (sol.corte?.cerradoAt) return { ok: false, motivo: "corte_cerrado" };

  await prisma.solicitud.update({
    where: { id: solicitudId },
    data: {
      costoProveedorReal: monto,
      facturadoAt: new Date(),
      facturadoPor: adminId,
    },
  });
  await prisma.solicitudLog.create({
    data: {
      solicitudId,
      canal: "admin",
      accion: "factura_capturada",
      detalle: `monto=${monto.toString()}`,
    },
  });
  return { ok: true };
}

/** Asigna (o cambia) el proveedor de una solicitud antes de conciliar. */
export async function asignarProveedor(
  solicitudId: number,
  proveedorId: number,
  adminId: number,
): Promise<Resultado> {
  if (await corteCerradoDe(solicitudId)) {
    return { ok: false, motivo: "corte_cerrado" };
  }
  await prisma.solicitud.update({
    where: { id: solicitudId },
    data: { proveedorId },
  });
  await prisma.solicitudLog.create({
    data: {
      solicitudId,
      canal: "admin",
      accion: "proveedor_asignado",
      detalle: `proveedorId=${proveedorId} por admin ${adminId}`,
    },
  });
  return { ok: true };
}

/** Cierra el corte: congela el costo esperado por trámite y los totales. */
export async function cerrarCorte(s: Semana, adminId: number): Promise<Corte> {
  const filas = await filasDeCorte(s);
  const t = totales(filas);

  return prisma.$transaction(async (tx) => {
    const corte = await tx.corte.upsert({
      where: { inicio_fin: { inicio: s.inicio, fin: s.fin } },
      update: {},
      create: { inicio: s.inicio, fin: s.fin },
    });

    for (const f of filas) {
      await tx.solicitud.update({
        where: { id: f.solicitudId },
        data: {
          corteId: corte.id,
          costoProveedorEsperado: f.esperado ?? undefined,
        },
      });
    }

    return tx.corte.update({
      where: { id: corte.id },
      data: {
        cerradoAt: new Date(),
        cerradoPor: adminId,
        totalEntregadas: t.nEntregadas,
        totalEsperado: t.sumaEsperado,
        totalReal: t.sumaReal,
        totalDiferencia: t.sumaDiferencia,
      },
    });
  });
}

/** Reabre un corte cerrado (mantiene los `corteId` de las solicitudes). */
export async function reabrirCorte(
  corteId: number,
  adminId: number,
): Promise<Corte> {
  return prisma.corte.update({
    where: { id: corteId },
    data: { cerradoAt: null, cerradoPor: adminId },
  });
}
