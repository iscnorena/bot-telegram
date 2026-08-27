import { Prisma } from "@prisma/client";

type Monto = Prisma.Decimal | number | string | null | undefined;

/** Convierte a número (los Decimal de Prisma serializan bien con Number()). */
export function aNumero(m: Monto): number {
  if (m === null || m === undefined || m === "") return 0;
  return typeof m === "number" ? m : Number(m.toString());
}

/** Formato de pesos mexicanos: 350 -> "$350.00". */
export function mxn(m: Monto): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(aNumero(m));
}

/**
 * Parsea el monto que teclea el admin ("120", "120.5", "$120.00", "1,200").
 * Devuelve un `Prisma.Decimal` >= 0, o `null` si no es un número válido.
 */
export function aDecimal(entrada: string): Prisma.Decimal | null {
  const limpio = entrada.replace(/[$,\s]/g, "").trim();
  if (limpio === "" || !/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const d = new Prisma.Decimal(limpio);
  return d.isNegative() ? null : d;
}
