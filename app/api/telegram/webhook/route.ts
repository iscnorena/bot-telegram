import { NextResponse } from "next/server";
import { env, proveedorChatId } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { telegramService } from "@/lib/services/telegramService";
import { resolverSolicitud } from "@/lib/services/resolverSolicitud";
import { entregaActaService } from "@/lib/services/entregaActaService";
import { ackProveedor, avisoAdmin } from "@/lib/copy";
import { manejarMensajeUsuario } from "@/lib/bot/flujoUsuario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANAL = "telegram_proveedor";

/** Respuesta estándar: Telegram reintenta el update si no recibe 2xx. */
const ok = () => NextResponse.json({ ok: true });

async function bestEffort(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    /* no interrumpe el manejo del webhook */
  }
}

interface TgMessage {
  chat?: { id?: number };
  text?: string;
  caption?: string;
  document?: { file_id: string };
}

export async function POST(req: Request): Promise<Response> {
  let update: { message?: TgMessage };
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body no es JSON" }, { status: 400 });
  }

  try {
    if (
      req.headers.get("x-telegram-bot-api-secret-token") !==
      env.TELEGRAM_WEBHOOK_SECRET
    ) {
      return ok();
    }

    const message = update.message;
    if (!message?.chat?.id) return ok();

    // El proveedor solo "actúa" al enviar un documento o el comando `NO ...`.
    // Cualquier otro mensaje (de quien sea) va al flujo conversacional del usuario.
    const esProveedor = message.chat.id === proveedorChatId();
    const accionProveedor =
      esProveedor &&
      (!!message.document || /^no\s+/i.test((message.text ?? "").trim()));

    if (accionProveedor) {
      if (message.document) {
        await manejarDocumento(message.document.file_id, message.caption ?? "");
      } else {
        await manejarTexto(message.text ?? "");
      }
      return ok();
    }

    await manejarMensajeUsuario({
      chat: { id: message.chat.id },
      text: message.text,
    });
    return ok();
  } catch (err) {
    await bestEffort(() =>
      telegramService.notificarAdmin(
        `Error no controlado en webhook: ${(err as Error).message}`,
      ),
    );
    return ok();
  }
}

async function manejarDocumento(
  fileId: string,
  captionRaw: string,
): Promise<void> {
  const caption = captionRaw.trim();

  if (caption === "") {
    await rechazarDocumento(fileId, caption, "caption vacío");
    return;
  }

  const r = await resolverSolicitud(caption);

  if (r.tipo === "id" || r.tipo === "curp") {
    await entregaActaService.entregar(r.solicitud.id, fileId, CANAL);
    return;
  }

  const motivo =
    r.tipo === "ambiguo"
      ? `CURP ambigua (${r.ids.join(", ")})`
      : r.tipo === "sin_match"
        ? "sin coincidencia"
        : "formato de caption no válido";
  await rechazarDocumento(fileId, caption, motivo);
}

async function rechazarDocumento(
  fileId: string,
  caption: string,
  motivo: string,
): Promise<void> {
  await bestEffort(() =>
    telegramService.notificarAdmin(
      avisoAdmin.documentoSinIdentificar(fileId, motivo, caption),
    ),
  );
  await ackProv(ackProveedor.documentoSinIdentificar(caption));
}

async function manejarTexto(textRaw: string): Promise<void> {
  const m = /^no\s+(.+)$/i.exec(textRaw.trim());
  if (!m) return; // no empieza con "NO " -> se ignora sin ruido ni ack

  const r = await resolverSolicitud(m[1]);

  if (r.tipo === "id" || r.tipo === "curp") {
    const hecho = await entregaActaService.marcarNoEncontrado(
      r.solicitud.id,
      CANAL,
      false,
    );
    await bestEffort(() =>
      prisma.solicitudLog.create({
        data: {
          solicitudId: r.solicitud.id,
          canal: CANAL,
          accion: "comando_no_encontrado",
          detalle: `resuelto=${hecho}`,
        },
      }),
    );
    await ackProv(
      hecho
        ? ackProveedor.noEncontradoRegistrado(r.solicitud.id)
        : ackProveedor.sinCambio(r.solicitud.id),
    );
    return;
  }

  if (r.tipo === "sin_match") {
    await ackProv(ackProveedor.sinMatch(r.token));
    return;
  }

  if (r.tipo === "ambiguo") {
    await bestEffort(() =>
      telegramService.notificarAdmin(avisoAdmin.comandoAmbiguo(r.curp, r.ids)),
    );
    await ackProv(ackProveedor.ambiguo(r.curp, r.ids));
    return;
  }

  // formato_invalido
  await ackProv(ackProveedor.formatoInvalido());
}

async function ackProv(text: string): Promise<void> {
  await bestEffort(() =>
    telegramService.sendMessage({ chatId: proveedorChatId(), text }),
  );
}
