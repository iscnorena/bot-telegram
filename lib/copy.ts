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

/** Textos del panel web del proveedor. */
export const panel = {
  titulo: "Panel de gestoría de acta de nacimiento",
  subtitulo: "Solicitudes pendientes de trámite",
  login: {
    titulo: "Acceso de proveedor",
    email: "Correo",
    password: "Contraseña",
    entrar: "Entrar",
    error: "Correo o contraseña incorrectos.",
  },
  cerrarSesion: "Cerrar sesión",
  columnas: {
    id: "ID",
    curp: "CURP",
    nombre: "Nombre",
    estado: "Estado",
    recibida: "Recibida",
    acciones: "Acciones",
  },
  subirPdf: "Entregar acta (PDF)",
  marcarNoEncontrada: "Marcar como no encontrada",
  sinPendientes: "No hay solicitudes pendientes.",
  ok: {
    entregada: (id: number) =>
      `Solicitud #${id}: acta entregada al solicitante.`,
    noEncontrada: (id: number) =>
      `Solicitud #${id}: marcada como no encontrada. Puedes reintentar más tarde.`,
  },
  err: {
    faltaArchivo: "Adjunta el PDF del acta.",
    noPdf: "El archivo debe ser un PDF.",
    muyGrande: "El PDF supera el tamaño máximo permitido (4 MB).",
    noProcesada:
      "No se pudo procesar la entrega: la solicitud ya está cerrada o en proceso.",
  },
};

/** Textos del flujo conversacional del usuario en Telegram. */
export const bot = {
  menu: {
    iniciar: "📄 Iniciar trámite de gestoría",
    consultar: "🔎 Consultar estado",
  },

  bienvenida: [
    "Hola. Este es el servicio de *gestoría de acta de nacimiento*: gestionamos",
    "el trámite de tu acta como intermediario. No expedimos ni emitimos el",
    "documento oficial.",
    "",
    "Usamos tu CURP únicamente para gestionar este trámite.",
    "",
    "¿Qué necesitas?",
  ].join("\n"),

  pedirCurp:
    "Escribe tu CURP (18 caracteres) para iniciar el trámite de gestoría de acta de nacimiento.",
  pedirCurpConsulta:
    "Escribe la CURP con la que registraste el trámite para consultar su estado.",
  curpInvalida: (restantes: number) =>
    `Esa CURP no tiene un formato válido. Revísala e inténtalo de nuevo (te quedan ${restantes} intento${restantes === 1 ? "" : "s"}).`,
  curpReintentosAgotados:
    "No pude validar la CURP. Volvamos a empezar cuando quieras.",

  solicitudRegistrada: (id: number, precio: string, dev: boolean) =>
    [
      `Tu solicitud de gestoría de acta de nacimiento *#${id}* fue registrada.`,
      `Costo del servicio: ${precio}.`,
      "En breve recibirás las instrucciones de pago. Cuando el pago se confirme,",
      "enviaremos tu solicitud al proveedor que realiza el trámite.",
      ...(dev ? ["", "_(dev)_ escribe `/simular_pago` para continuar."] : []),
    ].join("\n"),

  pagoConfirmado: (id: number) =>
    `Pago recibido. Tu trámite de gestoría de acta de nacimiento *#${id}* está en proceso; te avisaremos en cuanto el proveedor lo complete.`,

  yaTienesTramite: (id: number) =>
    `Ya tienes un trámite de gestoría en curso (#${id}). Puedes iniciar otro si lo necesitas.`,

  sinSolicitudParaPago:
    "No encontré un trámite tuyo pendiente de pago. Inicia uno con el menú.",

  consultaSinResultados:
    "No encontré ningún trámite de gestoría a tu nombre con esa CURP.",
  consultaEstado: (id: number, estadoTexto: string) =>
    `Trámite de gestoría de acta de nacimiento *#${id}*: ${estadoTexto}`,

  noEntiendo: "No te entendí. Usa los botones del menú.",

  /** Mapa estado interno -> texto amable para la consulta del usuario. */
  estadoLegible: (estado: string): string => {
    switch (estado) {
      case "pendiente_curp":
        return "registrado, pendiente de pago.";
      case "pagado":
      case "enviado_proveedor":
      case "entregando":
      case "no_encontrado_proveedor":
        return "en proceso con el proveedor. Te avisaremos al terminar.";
      case "entregado":
        return "entregado. Revisa el documento que te enviamos por este chat.";
      case "no_encontrado":
        return "no fue posible completarlo. Se procesará el reembolso.";
      default:
        return "en proceso.";
    }
  },
};

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
