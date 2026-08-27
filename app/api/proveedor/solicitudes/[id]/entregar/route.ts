import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { entregaActaService } from "@/lib/services/entregaActaService";
import { telegramService } from "@/lib/services/telegramService";
import { CAPTION_ENTREGA, panel } from "@/lib/copy";
import { MAX_PDF_BYTES } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Subida del PDF del acta por el panel web, patrón **pass-through**: el binario
 * se reenvía directo a `sendDocument` de la Bot API y se descarta al terminar el
 * request. Nunca se escribe a disco, bucket ni cola.
 */

function volverAlPanel(
  req: Request,
  query: Record<string, string>,
): NextResponse {
  const url = new URL("/proveedor", req.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(
  req: Request,
  ctx: { params: { id: string } },
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const id = Number(ctx.params.id);
  if (!Number.isSafeInteger(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return volverAlPanel(req, { error: panel.err.faltaArchivo });
  }

  const archivo = form.get("archivo");
  if (!(archivo instanceof Blob) || archivo.size === 0) {
    return volverAlPanel(req, { error: panel.err.faltaArchivo });
  }

  const filename =
    archivo instanceof File && archivo.name ? archivo.name : "acta.pdf";
  const esPdf =
    archivo.type === "application/pdf" ||
    filename.toLowerCase().endsWith(".pdf");
  if (!esPdf) return volverAlPanel(req, { error: panel.err.noPdf });
  if (archivo.size > MAX_PDF_BYTES) {
    return volverAlPanel(req, { error: panel.err.muyGrande });
  }

  const entregada = await entregaActaService.entregarConEnvio(
    id,
    "panel_web",
    (chatId) =>
      telegramService.sendDocumentBinary({
        chatId,
        file: archivo,
        filename,
        caption: CAPTION_ENTREGA,
      }),
    { proveedorId: Number(session.user.id) },
  );

  return volverAlPanel(
    req,
    entregada ? { entregada: String(id) } : { error: panel.err.noProcesada },
  );
}
