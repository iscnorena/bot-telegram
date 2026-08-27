import { prisma } from "@/lib/prisma";
import { EstadoSolicitud, type Solicitud } from "@prisma/client";

/**
 * Estados en los que una solicitud todavía admite una entrega o un "no encontrado".
 */
export const ESTADOS_ABIERTOS: EstadoSolicitud[] = [
  EstadoSolicitud.enviado_proveedor,
  EstadoSolicitud.no_encontrado_proveedor,
];

export type ResultadoResolver =
  | { tipo: "id"; solicitud: Solicitud }
  | { tipo: "curp"; solicitud: Solicitud }
  | { tipo: "sin_match"; token: string }
  | { tipo: "ambiguo"; curp: string; ids: number[] }
  | { tipo: "formato_invalido"; token: string };

/**
 * Resuelve un token `<id|CURP>` (del caption de un documento o del comando `NO`).
 *
 * - Entero puro  -> `findUnique` por `id` (sin filtrar por estado; el rechazo por
 *   estado lo aplica `entregaActaService`).
 * - 18 alfanuméricos -> match por `curp` (normalizada a mayúsculas), considerando
 *   solo solicitudes en `ESTADOS_ABIERTOS`. 0 -> sin match, 1 -> match, >1 -> ambiguo.
 * - Cualquier otra forma -> formato inválido.
 */
export async function resolverSolicitud(
  tokenRaw: string,
): Promise<ResultadoResolver> {
  const token = tokenRaw.trim();

  if (/^\d+$/.test(token)) {
    const id = Number(token);
    if (!Number.isSafeInteger(id)) return { tipo: "formato_invalido", token };
    const solicitud = await prisma.solicitud.findUnique({ where: { id } });
    return solicitud
      ? { tipo: "id", solicitud }
      : { tipo: "sin_match", token };
  }

  if (/^[A-Za-z0-9]{18}$/.test(token)) {
    const curp = token.toUpperCase();
    const abiertas = await prisma.solicitud.findMany({
      where: { curp, estado: { in: ESTADOS_ABIERTOS } },
      orderBy: { id: "asc" },
    });
    if (abiertas.length === 0) return { tipo: "sin_match", token };
    if (abiertas.length > 1) {
      return { tipo: "ambiguo", curp, ids: abiertas.map((s) => s.id) };
    }
    return { tipo: "curp", solicitud: abiertas[0] };
  }

  return { tipo: "formato_invalido", token };
}
