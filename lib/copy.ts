/**
 * Textos visibles. Regla legal: usar SIEMPRE "gestoría de acta de nacimiento"
 * (intermediario que gestiona el trámite); nunca sugerir que el sistema
 * "expide", "genera" o "emite" el acta.
 */

/** Caption del documento cuando se entrega al usuario final. */
export const CAPTION_ENTREGA =
  "Aquí está el resultado de tu gestoría de acta de nacimiento.";

/** Aviso al usuario cuando la gestoría termina sin resultado (estado final). */
export const AVISO_NO_ENCONTRADO_FINAL =
  "No fue posible completar la gestoría de tu acta de nacimiento. Te contactaremos para el reembolso.";

/** Mensaje al proveedor cuando entra una nueva solicitud. */
export function notificacionProveedor(solicitudId: number, curp: string): string {
  return [
    "Nueva solicitud de gestoría de acta de nacimiento.",
    `ID: ${solicitudId}`,
    `CURP: ${curp}`,
    "",
    "Responde reenviando el PDF con el ID en el caption, o escribe:",
    `NO ${solicitudId}   (si no pudiste obtener el acta)`,
  ].join("\n");
}

/** Acks que el bot le devuelve al proveedor tras un comando o documento. */
export const ackProveedor = {
  noEncontradoRegistrado: (id: number) =>
    `✅ Solicitud #${id} marcada como no encontrada. Puedes reintentar la entrega más tarde.`,
  sinCambio: (id: number) =>
    `⚠️ La solicitud #${id} ya está cerrada o en proceso; no se hizo ningún cambio.`,
  sinMatch: (valor: string) =>
    `⚠️ No encontré ninguna solicitud para «${valor}».`,
  ambiguo: (curp: string, ids: number[]) =>
    `⚠️ «${curp}» tiene varias solicitudes abiertas (${ids
      .map((i) => `#${i}`)
      .join(", ")}). Responde con NO <id>.`,
  formatoInvalido: () => "⚠️ Formato no válido. Usa: NO <id> o NO <CURP>.",
  documentoSinIdentificar: (caption: string) =>
    `⚠️ Recibí el documento pero no pude identificar la solicitud (caption: «${caption}»). Reenvíalo con el ID de solicitud en el caption.`,
};

/** Notificaciones al admin. */
export const avisoAdmin = {
  entregada: (id: number, canal: string) =>
    `Solicitud #${id}: gestoría de acta de nacimiento entregada al usuario (canal: ${canal}).`,
  noEncontradaFinal: (id: number) =>
    `Solicitud #${id}: gestoría de acta de nacimiento cerrada como NO ENCONTRADA (final). Pendiente reembolso.`,
  documentoSinIdentificar: (fileId: string, motivo: string, caption: string) =>
    `Documento recibido del proveedor sin poder identificar la solicitud.\nMotivo: ${motivo}\nCaption: «${caption}»\nfile_id: ${fileId}`,
  comandoAmbiguo: (curp: string, ids: number[]) =>
    `Comando NO del proveedor ambiguo para CURP «${curp}»: ${ids
      .map((i) => `#${i}`)
      .join(", ")}.`,
  remitenteNoAutorizado: (chatId: number | string) =>
    `Mensaje ignorado: remitente no autorizado (chat.id ${chatId}).`,
};
