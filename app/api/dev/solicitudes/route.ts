import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { EstadoSolicitud } from "@prisma/client";
import { telegramService } from "@/lib/services/telegramService";
import { notificacionProveedor } from "@/lib/copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint de SIMULACIÓN del disparo a proveedor (la pasarela de pago está fuera
 * de alcance). Crea una solicitud directamente en `enviado_proveedor` y notifica
 * al proveedor por Telegram. Deshabilitado en producción.
 */

const bodySchema = z.object({
  chatIdUsuario: z.union([z.number(), z.string().regex(/^-?\d+$/)]),
  curp: z.string().regex(/^[A-Za-z0-9]{18}$/, "CURP debe tener 18 alfanuméricos"),
  nombre: z.string().optional(),
  apellidoPaterno: z.string().optional(),
  apellidoMaterno: z.string().optional(),
});

export async function POST(req: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "no disponible" }, { status: 404 });
  }

  if (req.headers.get("x-dev-secret") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "body no es JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validación", detalle: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const data = parsed.data;

  const solicitud = await prisma.solicitud.create({
    data: {
      chatIdUsuario: BigInt(data.chatIdUsuario),
      curp: data.curp.toUpperCase(),
      nombre: data.nombre ?? null,
      apellidoPaterno: data.apellidoPaterno ?? null,
      apellidoMaterno: data.apellidoMaterno ?? null,
      estado: EstadoSolicitud.enviado_proveedor,
      pagadoAt: new Date(),
      enviadoProveedorAt: new Date(),
    },
    select: { id: true, curp: true, estado: true },
  });

  await prisma.solicitudLog.createMany({
    data: [
      { solicitudId: solicitud.id, canal: "sistema", accion: "creada" },
      {
        solicitudId: solicitud.id,
        canal: "sistema",
        accion: "notificacion_proveedor",
      },
    ],
  });

  try {
    await telegramService.sendMessage({
      chatId: env.PROVEEDOR_TELEGRAM_CHAT_ID,
      text: notificacionProveedor(solicitud.id, solicitud.curp),
    });
  } catch (err) {
    await prisma.solicitudLog.create({
      data: {
        solicitudId: solicitud.id,
        canal: "sistema",
        accion: "error",
        detalle: `fallo al notificar proveedor: ${(err as Error).message}`,
      },
    });
  }

  return NextResponse.json(
    { id: solicitud.id, estado: solicitud.estado },
    { status: 201 },
  );
}
