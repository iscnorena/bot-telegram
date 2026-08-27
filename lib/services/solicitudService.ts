import { EstadoSolicitud, type Solicitud } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { telegramService } from "@/lib/services/telegramService";
import { servicioPorDefecto } from "@/lib/services/servicioService";
import { notificacionProveedor } from "@/lib/copy";
import { normalizarCurp } from "@/lib/curp";

const ESTADOS_ABIERTOS: EstadoSolicitud[] = [
  EstadoSolicitud.enviado_proveedor,
  EstadoSolicitud.no_encontrado_proveedor,
];

/** Estados en los que la solicitud aún no se envió al proveedor. */
const ESTADOS_PRE_PROVEEDOR: EstadoSolicitud[] = [
  EstadoSolicitud.pendiente_curp,
  EstadoSolicitud.pagado,
];

/** Crea una solicitud a partir de la CURP capturada en el chat. */
export async function crearSolicitud(args: {
  chatId: bigint;
  curp: string;
}): Promise<Solicitud> {
  const servicio = await servicioPorDefecto();
  const solicitud = await prisma.solicitud.create({
    data: {
      chatIdUsuario: args.chatId,
      curp: normalizarCurp(args.curp),
      estado: EstadoSolicitud.pendiente_curp,
      servicioId: servicio.id,
    },
  });
  await prisma.solicitudLog.create({
    data: { solicitudId: solicitud.id, canal: "sistema", accion: "creada" },
  });
  return solicitud;
}

/**
 * Marca la solicitud como pagada y la envía al proveedor. Transición
 * `pendiente_curp | pagado -> enviado_proveedor` con `updateMany` condicional.
 * Devuelve `false` si ya no estaba en un estado válido.
 */
export async function enviarAProveedor(solicitudId: number): Promise<boolean> {
  const ahora = new Date();
  const { count } = await prisma.solicitud.updateMany({
    where: { id: solicitudId, estado: { in: ESTADOS_PRE_PROVEEDOR } },
    data: {
      estado: EstadoSolicitud.enviado_proveedor,
      pagadoAt: ahora,
      enviadoProveedorAt: ahora,
    },
  });
  if (count === 0) return false;

  const solicitud = await prisma.solicitud.findUnique({
    where: { id: solicitudId },
  });
  if (!solicitud) return false;

  await prisma.solicitudLog.create({
    data: {
      solicitudId,
      canal: "sistema",
      accion: "notificacion_proveedor",
    },
  });

  try {
    await telegramService.sendMessage({
      chatId: env.PROVEEDOR_TELEGRAM_CHAT_ID,
      text: notificacionProveedor(solicitud.id, solicitud.curp),
    });
  } catch (err) {
    await prisma.solicitudLog.create({
      data: {
        solicitudId,
        canal: "sistema",
        accion: "error",
        detalle: `fallo al notificar proveedor: ${(err as Error).message}`,
      },
    });
  }

  return true;
}

/** Solicitudes de ESTE chat con esa CURP (privacidad: nunca las de otro chat). */
export async function solicitudesDeChatPorCurp(
  chatId: bigint,
  curp: string,
): Promise<Solicitud[]> {
  return prisma.solicitud.findMany({
    where: { chatIdUsuario: chatId, curp: normalizarCurp(curp) },
    orderBy: { id: "desc" },
  });
}

/** Última solicitud del chat que todavía no está cerrada. */
export async function ultimaSolicitudAbiertaDeChat(
  chatId: bigint,
): Promise<Solicitud | null> {
  return prisma.solicitud.findFirst({
    where: {
      chatIdUsuario: chatId,
      estado: {
        notIn: [EstadoSolicitud.entregado, EstadoSolicitud.no_encontrado],
      },
    },
    orderBy: { id: "desc" },
  });
}

export { ESTADOS_ABIERTOS, ESTADOS_PRE_PROVEEDOR };
