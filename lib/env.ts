import { z } from "zod";

/**
 * Validación de entorno perezosa: se comprueba en el primer acceso (en runtime),
 * no al importar el módulo. Así `next build` (que carga los módulos de las rutas
 * para "collect page data") no falla por variables ausentes en tiempo de build.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  PROVEEDOR_TELEGRAM_CHAT_ID: z.string().min(1),
  ADMIN_TELEGRAM_CHAT_ID: z.string().min(1),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

function load(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const faltantes = parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ");
      throw new Error(
        `Variables de entorno inválidas o faltantes: ${faltantes}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get: (_target, prop: string) => load()[prop as keyof Env],
  has: (_target, prop: string) => prop in load(),
});

/** `chat.id` del proveedor autorizado como número (Telegram los envía numéricos). */
export function proveedorChatId(): number {
  return Number(load().PROVEEDOR_TELEGRAM_CHAT_ID);
}
