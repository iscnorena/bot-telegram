import { Prisma, type Tarifa } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Tarifa (costo del proveedor) vigente para `usuario`+`servicio` en `fecha`.
 * "Vigente" = `vigenteDesde <= fecha` y (`vigenteHasta` null o `> fecha`).
 */
export async function tarifaVigente(
  usuarioId: number,
  servicioId: number,
  fecha: Date,
): Promise<Tarifa | null> {
  return prisma.tarifa.findFirst({
    where: {
      usuarioId,
      servicioId,
      vigenteDesde: { lte: fecha },
      OR: [{ vigenteHasta: null }, { vigenteHasta: { gt: fecha } }],
    },
    orderBy: { vigenteDesde: "desc" },
  });
}

/**
 * Registra una nueva tarifa: cierra la vigente actual (le pone `vigenteHasta`)
 * y crea la nueva a partir de `desde`.
 */
export async function ponerTarifa(
  usuarioId: number,
  servicioId: number,
  monto: Prisma.Decimal,
  desde: Date = new Date(),
): Promise<Tarifa> {
  return prisma.$transaction(async (tx) => {
    await tx.tarifa.updateMany({
      where: { usuarioId, servicioId, vigenteHasta: null },
      data: { vigenteHasta: desde },
    });
    return tx.tarifa.create({
      data: { usuarioId, servicioId, monto, vigenteDesde: desde },
    });
  });
}

export function tarifasDeProveedor(usuarioId: number): Promise<Tarifa[]> {
  return prisma.tarifa.findMany({
    where: { usuarioId },
    orderBy: [{ servicioId: "asc" }, { vigenteDesde: "desc" }],
  });
}
