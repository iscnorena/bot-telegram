import { prisma } from "@/lib/prisma";
import { telegramService } from "@/lib/services/telegramService";
import { EstadoSolicitud } from "@prisma/client";
import {
  AVISO_NO_ENCONTRADO_FINAL,
  CAPTION_ENTREGA,
  avisoAdmin,
} from "@/lib/copy";

/**
 * Servicio central de entrega. Implementa el patrón de "claim atómico":
 * ninguna llamada de red ocurre dentro de una transacción, y un `updateMany`
 * condicional por estado garantiza que dos entregas concurrentes no dupliquen
 * el envío.
 *
 * Semántica de retorno: `true` = la acción se completó ahora; `false` = no se
 * completó pero quedó registrada en `solicitud_logs`. Solo se lanza ante error
 * de infraestructura no recuperable.
 */

const ESTADOS_RECLAMABLES: EstadoSolicitud[] = [
  EstadoSolicitud.enviado_proveedor,
  EstadoSolicitud.no_encontrado_proveedor,
];

async function registrarLog(args: {
  solicitudId: number;
  canal: string;
  accion: string;
  detalle?: string;
}): Promise<void> {
  try {
    await prisma.solicitudLog.create({
      data: {
        solicitudId: args.solicitudId,
        canal: args.canal,
        accion: args.accion,
        detalle: args.detalle ?? null,
      },
    });
  } catch {
    // El log es best-effort; nunca debe tumbar el flujo de negocio.
  }
}

async function bestEffort(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    // notificaciones secundarias: no afectan el resultado
  }
}

/**
 * Núcleo de entrega con claim atómico y reversión. `enviar` hace el envío real
 * (por `file_id` en el flujo Telegram, o binario en el flujo del panel) y
 * devuelve el `file_id` resultante que Telegram asigna.
 */
export async function entregarConEnvio(
  solicitudId: number,
  canal: string,
  enviar: (chatId: bigint) => Promise<string>,
  opts: { proveedorId?: number } = {},
): Promise<boolean> {
  const previo = await prisma.solicitud.findUnique({
    where: { id: solicitudId },
    select: { estado: true, chatIdUsuario: true },
  });

  if (!previo) {
    await registrarLog({
      solicitudId,
      canal,
      accion: "entrega_rechazada",
      detalle: "solicitud inexistente",
    });
    return false;
  }

  // Claim atómico. Solo una llamada concurrente obtiene count === 1.
  const { count } = await prisma.solicitud.updateMany({
    where: { id: solicitudId, estado: { in: ESTADOS_RECLAMABLES } },
    data: { estado: EstadoSolicitud.entregando },
  });

  if (count === 0) {
    await registrarLog({
      solicitudId,
      canal,
      accion: "entrega_rechazada",
      detalle: `estado no reclamable: ${previo.estado}`,
    });
    return false;
  }

  try {
    const fileIdEntregado = await enviar(previo.chatIdUsuario);

    // Si no se sabe qué proveedor entregó (flujo Telegram) y hay exactamente
    // uno activo, se asigna; si hay varios, queda null y el admin lo asigna.
    let proveedorId = opts.proveedorId;
    if (!proveedorId) {
      const activos = await prisma.usuario.findMany({
        where: { rol: "proveedor", activo: true },
        select: { id: true },
        take: 2,
      });
      if (activos.length === 1) proveedorId = activos[0].id;
    }

    await prisma.solicitud.update({
      where: { id: solicitudId },
      data: {
        estado: EstadoSolicitud.entregado,
        entregadoAt: new Date(),
        fileIdEntregado,
        metodoEntrega: canal,
        ...(proveedorId ? { proveedorId } : {}),
      },
    });

    await registrarLog({
      solicitudId,
      canal,
      accion: "entrega",
      detalle: `file_id ${fileIdEntregado}`,
    });
    await bestEffort(() =>
      telegramService.notificarAdmin(avisoAdmin.entregada(solicitudId, canal)),
    );
    return true;
  } catch (err) {
    // Revertir EXACTAMENTE al estado de origen leído antes del claim.
    await prisma.solicitud.update({
      where: { id: solicitudId },
      data: { estado: previo.estado },
    });
    await registrarLog({
      solicitudId,
      canal,
      accion: "error",
      detalle: `fallo envío: ${(err as Error).message}`,
    });
    return false;
  }
}

/** Flujo Telegram: el proveedor reenvía un documento y tenemos su `file_id`. */
export async function entregar(
  solicitudId: number,
  fileId: string,
  canal: string,
): Promise<boolean> {
  return entregarConEnvio(solicitudId, canal, (chatId) =>
    telegramService.sendDocument({ chatId, fileId, caption: CAPTION_ENTREGA }),
  );
}

export async function marcarNoEncontrado(
  solicitudId: number,
  canal: string,
  esFinal: boolean,
): Promise<boolean> {
  const destino = esFinal
    ? EstadoSolicitud.no_encontrado
    : EstadoSolicitud.no_encontrado_proveedor;

  const origenValido: EstadoSolicitud[] = esFinal
    ? [EstadoSolicitud.enviado_proveedor, EstadoSolicitud.no_encontrado_proveedor]
    : [EstadoSolicitud.enviado_proveedor];

  const { count } = await prisma.solicitud.updateMany({
    where: { id: solicitudId, estado: { in: origenValido } },
    data: { estado: destino },
  });

  if (count === 0) {
    await registrarLog({
      solicitudId,
      canal,
      accion: "entrega_rechazada",
      detalle: `marcarNoEncontrado(esFinal=${esFinal}) sobre estado no válido`,
    });
    return false;
  }

  await registrarLog({
    solicitudId,
    canal,
    accion: "no_encontrado",
    detalle: `esFinal=${esFinal}`,
  });

  if (esFinal) {
    const sol = await prisma.solicitud.findUnique({
      where: { id: solicitudId },
      select: { chatIdUsuario: true },
    });
    if (sol) {
      await bestEffort(() =>
        telegramService.sendMessage({
          chatId: sol.chatIdUsuario,
          text: AVISO_NO_ENCONTRADO_FINAL,
        }),
      );
    }
    await bestEffort(() =>
      telegramService.notificarAdmin(avisoAdmin.noEncontradaFinal(solicitudId)),
    );
  }

  return true;
}

export const entregaActaService = {
  entregar,
  entregarConEnvio,
  marcarNoEncontrado,
};
