import { bot } from "@/lib/copy";
import { MAX_REINTENTOS_CURP, PRECIO_GESTORIA } from "@/lib/config";
import { esCurpValida } from "@/lib/curp";
import {
  quitarTeclado,
  tecladoMenu,
  telegramService,
} from "@/lib/services/telegramService";
import {
  obtenerPaso,
  resetMenu,
  setPaso,
} from "@/lib/services/conversacionService";
import {
  crearSolicitud,
  enviarAProveedor,
  solicitudesDeChatPorCurp,
  ultimaSolicitudAbiertaDeChat,
} from "@/lib/services/solicitudService";

/**
 * Máquina del flujo conversacional de la persona usuaria en Telegram.
 * El estado por chat vive en `Conversacion` (tabla); casi todo lo demás se
 * deriva de la solicitud.
 */

export interface MensajeUsuario {
  chat: { id: number };
  text?: string;
}

const enDev = () => process.env.NODE_ENV !== "production";

/** Primer token del texto, sin `@Bot` ni argumentos, en minúsculas. */
function comando(texto: string): string {
  return texto.split(/[\s@]/)[0]?.toLowerCase() ?? "";
}

async function responder(
  chatId: bigint,
  text: string,
  replyMarkup?: unknown,
): Promise<void> {
  await telegramService.sendMessage({
    chatId,
    text,
    replyMarkup,
    parseMode: "Markdown",
  });
}

export async function manejarMensajeUsuario(
  message: MensajeUsuario,
): Promise<void> {
  const chatId = BigInt(message.chat.id);
  const texto = (message.text ?? "").trim();
  const cmd = comando(texto);

  // /start | /menu | vacío -> menú
  if (texto === "" || cmd === "/start" || cmd === "/menu") {
    await resetMenu(chatId);
    await responder(chatId, bot.bienvenida, tecladoMenu());
    return;
  }

  // Comando dev para simular el pago
  if (enDev() && cmd === "/simular_pago") {
    const abierta = await ultimaSolicitudAbiertaDeChat(chatId);
    if (!abierta || abierta.estado !== "pendiente_curp") {
      await responder(chatId, bot.sinSolicitudParaPago, tecladoMenu());
      return;
    }
    await enviarAProveedor(abierta.id);
    await resetMenu(chatId, abierta.id);
    await responder(chatId, bot.pagoConfirmado(abierta.id), tecladoMenu());
    return;
  }

  // Botones del menú (envían texto predefinido)
  if (texto === bot.menu.iniciar) {
    const abierta = await ultimaSolicitudAbiertaDeChat(chatId);
    if (abierta) await responder(chatId, bot.yaTienesTramite(abierta.id));
    await setPaso(chatId, "esperando_curp", { intentos: 0 });
    await responder(chatId, bot.pedirCurp, quitarTeclado());
    return;
  }
  if (texto === bot.menu.consultar) {
    await setPaso(chatId, "esperando_curp_consulta", { intentos: 0 });
    await responder(chatId, bot.pedirCurpConsulta, quitarTeclado());
    return;
  }

  const estado = await obtenerPaso(chatId);

  if (
    estado.paso === "esperando_curp" ||
    estado.paso === "esperando_curp_consulta"
  ) {
    if (!esCurpValida(texto)) {
      const intentos = estado.intentos + 1;
      if (intentos >= MAX_REINTENTOS_CURP) {
        await resetMenu(chatId);
        await responder(chatId, bot.curpReintentosAgotados, tecladoMenu());
        return;
      }
      await setPaso(chatId, estado.paso, { intentos });
      await responder(chatId, bot.curpInvalida(MAX_REINTENTOS_CURP - intentos));
      return;
    }

    if (estado.paso === "esperando_curp") {
      const solicitud = await crearSolicitud({ chatId, curp: texto });
      await resetMenu(chatId, solicitud.id);
      await responder(
        chatId,
        bot.solicitudRegistrada(solicitud.id, PRECIO_GESTORIA, enDev()),
        tecladoMenu(),
      );
      return;
    }

    // esperando_curp_consulta
    const encontradas = await solicitudesDeChatPorCurp(chatId, texto);
    await resetMenu(chatId);
    if (encontradas.length === 0) {
      await responder(chatId, bot.consultaSinResultados, tecladoMenu());
      return;
    }
    const ultima = encontradas[0];
    await responder(
      chatId,
      bot.consultaEstado(ultima.id, bot.estadoLegible(ultima.estado)),
      tecladoMenu(),
    );
    return;
  }

  // paso "menu" / cualquier otra cosa
  await responder(chatId, bot.noEntiendo, tecladoMenu());
}
