import { prisma } from "@/lib/prisma";

export type Paso = "menu" | "esperando_curp" | "esperando_curp_consulta";

export interface EstadoConversacion {
  chatId: bigint;
  paso: Paso;
  solicitudId: number | null;
  intentos: number;
}

/** Devuelve el estado de conversación del chat, creándolo en `menu` si no existe. */
export async function obtenerPaso(chatId: bigint): Promise<EstadoConversacion> {
  const c = await prisma.conversacion.upsert({
    where: { chatId },
    update: {},
    create: { chatId },
  });
  return {
    chatId: c.chatId,
    paso: c.paso as Paso,
    solicitudId: c.solicitudId,
    intentos: c.intentos,
  };
}

export async function setPaso(
  chatId: bigint,
  paso: Paso,
  extra: { solicitudId?: number | null; intentos?: number } = {},
): Promise<void> {
  const data = {
    paso,
    ...(extra.solicitudId !== undefined ? { solicitudId: extra.solicitudId } : {}),
    ...(extra.intentos !== undefined ? { intentos: extra.intentos } : {}),
  };
  await prisma.conversacion.upsert({
    where: { chatId },
    update: data,
    create: { chatId, ...data },
  });
}

/** Vuelve al menú y limpia el contador de reintentos. */
export async function resetMenu(
  chatId: bigint,
  solicitudId?: number | null,
): Promise<void> {
  await setPaso(chatId, "menu", { intentos: 0, solicitudId: solicitudId ?? null });
}
