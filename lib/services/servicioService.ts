import type { Prisma, Servicio } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Servicio por defecto (el único en alcance: acta de nacimiento). */
export async function servicioPorDefecto(): Promise<Servicio> {
  const s =
    (await prisma.servicio.findUnique({ where: { slug: "acta_nacimiento" } })) ??
    (await prisma.servicio.findFirst({
      where: { activo: true },
      orderBy: { id: "asc" },
    }));
  if (!s) throw new Error("No hay ningún servicio configurado");
  return s;
}

export function listarServicios(): Promise<Servicio[]> {
  return prisma.servicio.findMany({ orderBy: { id: "asc" } });
}

export function actualizarServicio(
  id: number,
  data: { nombre?: string; precioUsuario?: Prisma.Decimal; activo?: boolean },
): Promise<Servicio> {
  return prisma.servicio.update({ where: { id }, data });
}
