import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  crearSolicitud,
  enviarAProveedor,
} from "@/lib/services/solicitudService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SIMULACIÓN del disparo a proveedor (la pasarela de pago está fuera de alcance).
 * Crea una solicitud y la envía al proveedor en un solo paso. Deshabilitado en
 * producción. Reutiliza `solicitudService` (misma lógica que el flujo del bot).
 */

const bodySchema = z.object({
  chatIdUsuario: z.union([z.number(), z.string().regex(/^-?\d+$/)]),
  curp: z.string().regex(/^[A-Za-z0-9]{18}$/, "CURP debe tener 18 alfanuméricos"),
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

  const solicitud = await crearSolicitud({
    chatId: BigInt(parsed.data.chatIdUsuario),
    curp: parsed.data.curp,
  });
  await enviarAProveedor(solicitud.id);

  return NextResponse.json(
    { id: solicitud.id, estado: "enviado_proveedor" },
    { status: 201 },
  );
}
