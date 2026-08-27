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

## Flujo del usuario en Telegram

El bot guía a la persona con un menú de botones (ReplyKeyboard). Sin túnel se
puede simular enviando updates al webhook:

```bash
SECRET=... ; CHAT=<tu chat.id> ; B=localhost:3000
post() { curl -s -X POST "$B/api/telegram/webhook" \
  -H "x-telegram-bot-api-secret-token: $SECRET" -H 'content-type: application/json' \
  -d "{\"message\":{\"chat\":{\"id\":$CHAT},\"text\":\"$1\"}}" ; }

post "/start"                              # bienvenida + teclado
post "📄 Iniciar trámite de gestoría"      # pide la CURP
post "TEST900101HDFRXX09"                  # CURP válida -> crea solicitud (pendiente_curp)
post "/simular_pago"                       # (dev) -> enviado_proveedor + avisa al proveedor
post "🔎 Consultar estado"                 # pide la CURP
post "TEST900101HDFRXX09"                  # muestra el estado del trámite
```

Luego el proveedor entrega (por Telegram o por el panel) y el bot reenvía el PDF
al usuario. `estado` interno vs. lo que ve el usuario: solo `entregado` y
`no_encontrado` generan aviso.

> **Solapamiento de chat**: si `PROVEEDOR_TELEGRAM_CHAT_ID` es tu propio chat, los
> **documentos** y los mensajes `NO ...` se tratan como acción de proveedor; todo
> lo demás (incl. `/start`) va al flujo de usuario. Para probar ambos roles con
> realismo usa una segunda cuenta de Telegram como usuaria.

## Flujo del proveedor por Telegram (sin panel)

```bash
SECRET=... ; PROV=<PROVEEDOR_TELEGRAM_CHAT_ID>

# Simular el disparo a proveedor de una vez (crea + envía)
curl -s -X POST localhost:3000/api/dev/solicitudes \
  -H "x-dev-secret: $SECRET" -H 'content-type: application/json' \
  -d '{"chatIdUsuario":"123456789","curp":"TEST900101HDFRXX09"}'
# -> { "id": 1, "estado": "enviado_proveedor" }

# Entrega: documento con caption = id de la solicitud
curl -s -X POST localhost:3000/api/telegram/webhook \
  -H "x-telegram-bot-api-secret-token: $SECRET" -H 'content-type: application/json' \
  -d "{\"message\":{\"chat\":{\"id\":$PROV},\"document\":{\"file_id\":\"FID\"},\"caption\":\"1\"}}"

# No encontrado: comando de texto
curl -s -X POST localhost:3000/api/telegram/webhook \
  -H "x-telegram-bot-api-secret-token: $SECRET" -H 'content-type: application/json' \
  -d "{\"message\":{\"chat\":{\"id\":$PROV},\"text\":\"NO 1\"}}"
```

Inspecciona el estado con `npx prisma studio`.

## Panel web del proveedor

```bash
# Crear cuentas (piden la contraseña por consola)
npm run proveedor:crear -- --email prov@dominio.mx --nombre "Proveedor Uno"
npm run usuario:crear   -- --email admin@dominio.mx --nombre "Admin" --rol admin

npm run dev
# http://localhost:3000/proveedor  -> redirige a /proveedor/login
```

Tras iniciar sesión, el panel lista las solicitudes en `enviado_proveedor` /
`no_encontrado_proveedor`. Por cada una: **subir el PDF** del acta (se reenvía
directo a Telegram sin guardarse en ningún lado) o **marcar como no encontrada**.
La subida entrega con `metodoEntrega = 'panel_web'` y guarda el `Usuario.id` en
`solicitud.proveedorId`.

## Panel de administración (`/admin`, rol admin)

Corte semanal **lunes–domingo** (hora de Ciudad de México, UTC-6). Cada domingo
se revisa lo entregado contra lo que factura el proveedor:

1. `/admin/tarifas` — registra el costo del proveedor por trámite (con historial;
   una tarifa nueva cierra la anterior).
2. `/admin/servicios` — precio que paga la persona usuaria (por servicio).
3. `/admin` — KPIs de la semana y últimas 8 semanas (entregadas, esperado,
   facturado, diferencia).
4. `/admin/cortes/<lunes YYYY-MM-DD>` — por cada entrega: captura **a mano** el
   monto facturado; se ve la diferencia y el score. **Cerrar corte** congela
   montos y totales (se puede **Reabrir**).

## Estructura

| Ruta | Rol |
|---|---|
| `prisma/schema.prisma` | Modelo de datos (`Solicitud`, `SolicitudLog`, enum de estados). |
| `lib/env.ts` | Validación perezosa de entorno (Zod). |
| `lib/copy.ts` | Textos visibles, conformes a la regla de terminología legal. |
| `lib/services/telegramService.ts` | Wrapper de la Bot API (sin descarga de archivos). |
| `lib/services/resolverSolicitud.ts` | Resuelve un token `<id\|CURP>` (reuso webhook ↔ comando). |
| `lib/services/entregaActaService.ts` | `entregarConEnvio` (claim atómico, estado `entregando`) + wrappers `entregar` / `marcarNoEncontrado`. |
| `lib/bot/flujoUsuario.ts` | Máquina del flujo conversacional del usuario (menú, CURP, consulta, `/simular_pago`). |
| `lib/services/conversacionService.ts` / `solicitudService.ts` | Estado de conversación por chat / crear-enviar-consultar solicitudes. |
| `lib/curp.ts` | Validación y normalización de CURP (formato local, sin RENAPO). |
| `auth.ts` / `auth.config.ts` / `middleware.ts` | Auth.js v5: Credentials + tabla `Usuario` (rol), sesión JWT; el middleware protege `/proveedor/**` y `/admin/**`. |
| `lib/sesion.ts` | `requireProveedor()` / `requireAdmin()`. |
| `lib/corte.ts` / `lib/dinero.ts` | Semana del corte (CDMX) / formato y parseo de montos. |
| `lib/services/conciliacionService.ts` / `tarifaService.ts` / `servicioService.ts` | Score del corte, tarifas del proveedor, precio del servicio. |
| `app/proveedor/` / `app/admin/` | Panel del proveedor / panel de administración (conciliación). |
| `app/api/proveedor/solicitudes/[id]/entregar/route.ts` | Subida del PDF (pass-through a Telegram). |
| `app/api/telegram/webhook/route.ts` | Webhook: usuario (conversacional) + proveedor (documentos / comando `NO`). |
| `app/api/dev/solicitudes/route.ts` | Simulación del disparo a proveedor (deshabilitado en producción). |
| `scripts/crear-usuario.mjs` | Alta de cuentas (`--rol admin|proveedor`) por CLI. |
| `test/` | Vitest con Prisma falso en memoria; sin llamadas reales de red. |

## Despliegue en Vercel + Supabase cloud

Destino: **Vercel** (repo de GitHub conectado, auto-deploy en cada push a `main`),
DB en **Supabase cloud**, dominio `*.vercel.app`, y **@GestoriaMX_bot** para prod.

1. **Supabase**: crear proyecto (región *East US*, para emparejar con Vercel
   `iad1`). De *Settings → Database → Connection string* saca:
   - `DATABASE_URL` = *Transaction pooler* (`:6543`) **+ `?pgbouncer=true&connection_limit=1`**
   - `DIRECT_URL` = *Session / Direct* (`:5432`) — solo para migraciones.
2. **Migrar prod** (desde tu máquina, con esas cadenas en el entorno):
   ```bash
   DATABASE_URL="<pooled>" DIRECT_URL="<direct>" npx prisma migrate deploy
   DATABASE_URL="<pooled>" DIRECT_URL="<direct>" node scripts/crear-usuario.mjs --email admin@tu.mx --nombre "Admin" --rol admin
   DATABASE_URL="<pooled>" DIRECT_URL="<direct>" node scripts/crear-usuario.mjs --email prov@tu.mx  --nombre "Proveedor" --rol proveedor
   ```
3. **Vercel**: importar `iscnorena/bot-telegram` (Next.js autodetectado). Variables
   de entorno (Production): `DATABASE_URL`, `DIRECT_URL`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_WEBHOOK_SECRET`, `PROVEEDOR_TELEGRAM_CHAT_ID`,
   `ADMIN_TELEGRAM_CHAT_ID`, `AUTH_SECRET`. Deploy.
4. **Verificar**: `GET https://<app>.vercel.app/api/health` → `{ ok: true }`;
   entrar a `/proveedor/login` y `/admin`.
5. **Webhook**:
   ```bash
   WEBHOOK_BASE_URL="https://<app>.vercel.app" npm run webhook:set
   npm run webhook:info        # url correcta, sin last_error
   ```
6. **End-to-end en prod**: `/start` en Telegram → CURP → `/admin/solicitudes` →
   *Enviar a proveedor* → entrega por panel o Telegram → el usuario recibe el PDF
   → conciliar en `/admin/cortes/<lunes>`.

> El webhook es único: mientras apunte a Vercel, los mensajes reales van a prod.
> Para desarrollar contra Telegram real en local: `npm run webhook:delete` o
> `WEBHOOK_BASE_URL=<túnel> npm run webhook:set`. El testeo local por `curl` al
> endpoint sigue funcionando siempre.
>
> En prod, `/api/dev/solicitudes` y `/simular_pago` están deshabilitados; el
> puente es la acción **Enviar a proveedor** en `/admin/solicitudes` (hasta que
> exista la pasarela de pago).

## Fuera de alcance en esta fase

Pasarela de pago real (se simula con `/simular_pago`), registro/gestión de
cuentas desde el navegador, alta de nuevos servicios por UI, multi-servicio en el
bot, importación de facturas por archivo, y el cierre "no encontrado" **final**.
Ver `docs/prompt.md`.

## Notas

- **`npm audit`**: los avisos provienen de Next 14 y de dependencias de
  desarrollo de Vitest (esbuild/vite, solo dev-server). No se aplica
  `npm audit fix --force` porque forzaría Next 16, fuera del alcance de esta fase.
- **`next build`** muestra un warning de `jose` (`CompressionStream` no soportado
  en Edge Runtime) al incluir Auth.js en el middleware. Es benigno: solo afecta a
  JWE comprimido, que la sesión JWT por defecto de Auth.js no usa.
