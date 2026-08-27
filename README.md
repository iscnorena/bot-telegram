# Bot de gestoría de acta de nacimiento

Backend del bot de Telegram para el **servicio de gestoría de acta de nacimiento**
(intermediario que gestiona el trámite; no expide ni emite el documento oficial).

Especificación completa: [`docs/prompt.md`](docs/prompt.md).

## Stack

- Next.js 14 (App Router) + TypeScript
- Prisma ORM sobre **PostgreSQL (Supabase)**
- Telegram Bot API vía webhook
- Vitest para tests
- **Sin storage de archivos**: nunca se persiste el PDF del acta, solo el
  `file_id` de Telegram como referencia.

## Puesta en marcha local

Requisitos: Node ≥ 18.18 y Docker (para Supabase local).

```bash
npm install
cp .env.example .env      # y rellena los valores (ver abajo)

# Base de datos local (Postgres que refleja prod):
npx supabase init         # una sola vez, genera supabase/
npx supabase start        # imprime DATABASE_URL / DIRECT_URL -> pégalas en .env
npx prisma migrate dev --name init

npm test                  # suite Vitest (no necesita DB ni Docker)
npm run dev               # http://localhost:3000
```

### Variables de entorno (`.env`)

| Variable | Cómo obtenerla |
|---|---|
| `DATABASE_URL` | La imprime `npx supabase start` (Postgres local `127.0.0.1:55322`). En prod: cadena *pooled* (PgBouncer, `:6543`) del proyecto Supabase. |
| `DIRECT_URL` | Igual que `DATABASE_URL` en local. En prod: conexión directa (`:5432`). Solo se usa para migraciones. |
| `TELEGRAM_BOT_TOKEN` | `@BotFather` → `/newbot`. |
| `TELEGRAM_WEBHOOK_SECRET` | Una cadena aleatoria que tú eliges. Valida el webhook y protege el endpoint dev. |
| `PROVEEDOR_TELEGRAM_CHAT_ID` | `chat.id` de la cuenta/grupo del proveedor (p. ej. con `@userinfobot`). |
| `ADMIN_TELEGRAM_CHAT_ID` | `chat.id` que recibe las notificaciones de administración. |
| `AUTH_SECRET` | Secreto de Auth.js para el panel web. Genera uno con `npx auth secret` o `openssl rand -base64 33`. |

## Flujo manual (sin Telegram real)

Con `npm run dev` corriendo y `.env` configurado:

```bash
SECRET=... # el TELEGRAM_WEBHOOK_SECRET

# 1. Simular el disparo a proveedor (crea la solicitud en 'enviado_proveedor')
curl -s -X POST localhost:3000/api/dev/solicitudes \
  -H "x-dev-secret: $SECRET" -H 'content-type: application/json' \
  -d '{"chatIdUsuario":"123456789","curp":"ABCD010203HDFXYZ09"}'
# -> { "id": 1, "estado": "enviado_proveedor" }

# 2. Simular la entrega del proveedor (documento con caption = id)
curl -s -X POST localhost:3000/api/telegram/webhook \
  -H "x-telegram-bot-api-secret-token: $SECRET" -H 'content-type: application/json' \
  -d '{"message":{"chat":{"id":<PROVEEDOR_CHAT_ID>},"document":{"file_id":"FID"},"caption":"1"}}'
# -> la solicitud pasa a 'entregado'

# 3. Simular "no encontrado" del proveedor (comando de texto)
curl -s -X POST localhost:3000/api/telegram/webhook \
  -H "x-telegram-bot-api-secret-token: $SECRET" -H 'content-type: application/json' \
  -d '{"message":{"chat":{"id":<PROVEEDOR_CHAT_ID>},"text":"NO 1"}}'
```

Inspecciona el estado con `npx prisma studio`.

## Panel web del proveedor

```bash
# Crear una cuenta de proveedor (pide la contraseña por consola)
npm run proveedor:crear -- --email prov@dominio.mx --nombre "Nombre Visible"

npm run dev
# http://localhost:3000/proveedor  -> redirige a /proveedor/login
```

Tras iniciar sesión, el panel lista las solicitudes en `enviado_proveedor` /
`no_encontrado_proveedor`. Por cada una: **subir el PDF** del acta (se reenvía
directo a Telegram sin guardarse en ningún lado) o **marcar como no encontrada**.
La subida entrega con `metodoEntrega = 'panel_web'` y guarda el `Proveedor.id` en
`solicitud.proveedorId`.

## Estructura

| Ruta | Rol |
|---|---|
| `prisma/schema.prisma` | Modelo de datos (`Solicitud`, `SolicitudLog`, enum de estados). |
| `lib/env.ts` | Validación perezosa de entorno (Zod). |
| `lib/copy.ts` | Textos visibles, conformes a la regla de terminología legal. |
| `lib/services/telegramService.ts` | Wrapper de la Bot API (sin descarga de archivos). |
| `lib/services/resolverSolicitud.ts` | Resuelve un token `<id\|CURP>` (reuso webhook ↔ comando). |
| `lib/services/entregaActaService.ts` | `entregarConEnvio` (claim atómico, estado `entregando`) + wrappers `entregar` / `marcarNoEncontrado`. |
| `auth.ts` / `auth.config.ts` / `middleware.ts` | Auth.js v5: Credentials + tabla `Proveedor`, sesión JWT; el middleware protege `/proveedor/**`. |
| `app/proveedor/` | Panel del proveedor: `login`, lista de solicitudes, acciones. |
| `app/api/proveedor/solicitudes/[id]/entregar/route.ts` | Subida del PDF (pass-through a Telegram). |
| `app/api/telegram/webhook/route.ts` | Webhook: documentos del proveedor + comando `NO`. |
| `app/api/dev/solicitudes/route.ts` | Simulación del disparo a proveedor (deshabilitado en producción). |
| `scripts/crear-proveedor.mjs` | Alta de cuentas de proveedor por CLI. |
| `test/` | Vitest con Prisma falso en memoria; sin llamadas reales de red. |

## Fuera de alcance en esta fase

Flujo conversacional del usuario final, pasarela de pago, registro/gestión de
cuentas de proveedor desde el navegador, y el comando del proveedor para el "no
encontrado" **final**. Ver `docs/prompt.md`.

## Notas

- **`npm audit`**: los avisos provienen de Next 14 y de dependencias de
  desarrollo de Vitest (esbuild/vite, solo dev-server). No se aplica
  `npm audit fix --force` porque forzaría Next 16, fuera del alcance de esta fase.
- **`next build`** muestra un warning de `jose` (`CompressionStream` no soportado
  en Edge Runtime) al incluir Auth.js en el middleware. Es benigno: solo afecta a
  JWE comprimido, que la sesión JWT por defecto de Auth.js no usa.
