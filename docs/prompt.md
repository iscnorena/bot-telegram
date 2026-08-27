# Proyecto: Bot de Telegram para gestoría de acta de nacimiento

## Contexto del negocio
Sistema que ayuda a usuarios a tramitar la gestoría de su acta de nacimiento en México. El flujo es:
1. Usuario interactúa con un bot de Telegram, proporciona o consulta su CURP.
2. Usuario paga el servicio de gestoría. **La pasarela de pago está fuera de alcance; este punto se simula con el endpoint `app/api/dev/solicitudes/route.ts` (ver Regla 2), que crea la solicitud directamente en estado `enviado_proveedor`.**
3. El sistema notifica automáticamente a un proveedor externo (vía Telegram) que hay una nueva solicitud de gestoría.
4. El proveedor tramita el acta y responde por una de tres vías:
   - reenviando el PDF al bot de Telegram (con un `caption` que identifica la solicitud),
   - enviando un comando de texto `NO <id|CURP>` al bot si no pudo obtener el acta,
   - subiéndola desde un panel web con su propio login (fuera de alcance en esta sesión).
5. El sistema entrega automáticamente el PDF al usuario final y notifica al admin; o, si el resultado es "no encontrado" definitivo, avisa al usuario.

## Stack técnico
- Framework: Next.js 14+ (App Router), TypeScript
- Base de datos: **Supabase (PostgreSQL)** vía Prisma ORM
  - `datasource db`: `provider = "postgresql"`, `url = env("DATABASE_URL")` (conexión *pooled* / PgBouncer, puerto 6543, con `?pgbouncer=true&connection_limit=1`) y `directUrl = env("DIRECT_URL")` (conexión directa, puerto 5432, solo para migraciones).
  - Cliente Prisma como **singleton** en `lib/prisma.ts` (evita agotar conexiones en serverless).
  - Desarrollo local: Supabase local vía Docker (`npx supabase start`); imprime las cadenas de conexión (Postgres en `127.0.0.1:54322`). El proyecto Supabase en la nube solo se necesita al desplegar en Vercel.
- Bot: Telegram Bot API vía webhook — Route Handler en `app/api/telegram/webhook/route.ts`
- **Storage de archivos: NINGUNO.** Los PDFs nunca se persisten en el backend — ver sección "Manejo de archivos sin storage" abajo.
- Panel web proveedor: páginas Next.js (App Router) con **Auth.js v5 (`next-auth@beta`)**, provider Credentials (email + contraseña `bcryptjs`), tabla `Proveedor`, sesión JWT en cookie (sin adapter de DB). Ver Regla 5.
- Validación: Zod
- Tests: **Vitest**
- Despliegue: Vercel (entorno de pruebas, sin VPS por ahora)
- Todos los Route Handlers que tocan Prisma deben declarar `export const runtime = 'nodejs'` y `export const dynamic = 'force-dynamic'` (Prisma no corre en el runtime Edge).

## Variables de entorno (`.env.example`)

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión Postgres *pooled* (PgBouncer) para Prisma en runtime. `?pgbouncer=true&connection_limit=1`. |
| `DIRECT_URL` | Conexión Postgres directa, solo para `prisma migrate` / `prisma db push`. |
| `TELEGRAM_BOT_TOKEN` | Token del bot para todas las llamadas a la Bot API. |
| `TELEGRAM_WEBHOOK_SECRET` | Valor esperado en el header `X-Telegram-Bot-Api-Secret-Token` del webhook. También protege el endpoint dev. |
| `PROVEEDOR_TELEGRAM_CHAT_ID` | `chat.id` autorizado como proveedor (documentos y comando `NO`). |
| `ADMIN_TELEGRAM_CHAT_ID` | `chat.id` al que se envían todas las notificaciones de `notificarAdmin`. |
| `AUTH_SECRET` | Secreto de Auth.js v5 para firmar el JWT de sesión del panel. Generar con `npx auth secret`. |

## Manejo de archivos SIN storage (regla crítica de arquitectura)
El sistema nunca guarda una copia del PDF del acta en ningún storage propio (ni local, ni S3/R2, ni base de datos). Solo se guarda una **referencia** (`file_id` de Telegram), nunca el binario. Dos casos:

1. **Entrega vía Telegram (proveedor reenvía el documento al bot):** Telegram ya asigna un `file_id` al documento recibido. Como el mismo bot recibe y envía, ese `file_id` es válido para reenviarlo: usar ese MISMO `file_id` en una llamada a `sendDocument` — Telegram reenvía el archivo servidor-a-servidor sin que pase por nuestro backend. NUNCA llamar a `getFile`/descargar el binario para este flujo.

2. **Entrega vía panel web (proveedor sube el archivo desde el navegador):** el Route Handler debe reenviar el archivo en modo "pass-through" dentro del mismo request — recibirlo como `multipart/form-data`, validar tamaño (el body de una función serverless de Vercel ronda 4.5 MB máx.), reenviarlo inmediatamente como `multipart/form-data` al endpoint `sendDocument` de la Bot API, y descartar el buffer al terminar el request. NUNCA escribir el archivo a disco, ni a un bucket, ni pasarlo a un job en cola.

Guardar únicamente en base de datos: el `file_id` que Telegram devuelve tras `sendDocument` (referencia, no el contenido).

## Modelo de datos (schema Prisma)

```prisma
model Solicitud {
  id                 Int       @id @default(autoincrement())
  chatIdUsuario      BigInt    @map("chat_id_usuario")
  curp               String    @db.VarChar(18) // se guarda SIEMPRE normalizada a mayúsculas
  nombre             String?
  apellidoPaterno    String?   @map("apellido_paterno")
  apellidoMaterno    String?   @map("apellido_materno")
  estado             EstadoSolicitud @default(pendiente_curp)
  metodoEntrega      String?   @map("metodo_entrega") // 'telegram_proveedor' | 'panel_web'
  fileIdEntregado    String?   @map("file_id_entregado") // solo referencia de Telegram, nunca el archivo
  proveedorId        Int?      @map("proveedor_id")
  pagadoAt           DateTime? @map("pagado_at")
  enviadoProveedorAt DateTime? @map("enviado_proveedor_at")
  entregadoAt        DateTime? @map("entregado_at")
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  logs SolicitudLog[]

  @@index([curp])
  @@index([chatIdUsuario])
  @@index([estado])
  @@map("solicitudes")
}

enum EstadoSolicitud {
  pendiente_curp
  pagado
  enviado_proveedor
  entregando               // transitorio: una entrega fue reclamada y sendDocument está en curso
  no_encontrado_proveedor  // interno: el proveedor no lo encontró, pero puede reintentar
  entregado                // cerrado
  no_encontrado            // cerrado (final, se avisa al usuario)
}

model SolicitudLog {
  id          Int      @id @default(autoincrement())
  solicitudId Int      @map("solicitud_id")
  canal       String   // 'telegram_proveedor' | 'panel_web' | 'sistema'
  accion      String   // ver conjunto cerrado abajo
  detalle     String?  @db.Text
  createdAt   DateTime @default(now()) @map("created_at")

  solicitud Solicitud @relation(fields: [solicitudId], references: [id])

  @@index([solicitudId])
  @@map("solicitud_logs")
}

model Usuario {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  passwordHash String   @map("password_hash")
  nombre       String
  rol          String   @default("proveedor") // 'admin' | 'proveedor'
  activo       Boolean  @default(true)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("usuarios")
}

// Estado de la conversación de Telegram por chat (Telegram no guarda estado).
model Conversacion {
  chatId      BigInt   @id @map("chat_id")
  paso        String   @default("menu") // menu | esperando_curp | esperando_curp_consulta
  solicitudId Int?     @map("solicitud_id")
  intentos    Int      @default(0) // reintentos de CURP inválida en el paso actual
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("conversaciones")
}
```

> El schema completo y vigente vive en `prisma/schema.prisma`. Además de lo de
> arriba, incluye:
>
> - **`Servicio`** `{ slug, nombre, precioUsuario Decimal, activo }` — el precio
>   al usuario final es configurable por servicio (reemplaza la constante
>   `PRECIO_GESTORIA`). Seed: `acta_nacimiento`.
> - **`Tarifa`** `{ usuarioId (proveedor), servicioId, monto Decimal, vigenteDesde,
>   vigenteHasta? }` — costo que cobra el proveedor, con historial de vigencias.
> - **`Corte`** `{ inicio, fin, cerradoAt?, cerradoPor?, total* }` — semana
>   lunes–domingo (CDMX, UTC-6). Al cerrarse congela los totales.
> - **`Solicitud`** gana `servicioId`, `costoProveedorEsperado` (congelado al
>   cerrar el corte), `costoProveedorReal` (captura manual del admin),
>   `facturadoAt/Por`, `corteId`.
>
> `Solicitud.proveedorId` referencia a `Usuario` (rol `proveedor`); se rellena en
> la entrega por panel, y en la entrega por Telegram si hay exactamente un
> proveedor activo (si no, lo asigna el admin desde el corte).

- `canal` (param de servicio y columna de log): `'telegram_proveedor' | 'panel_web' | 'sistema'`.
- `metodoEntrega` (columna de `Solicitud`): solo `'telegram_proveedor' | 'panel_web'` (nunca `'sistema'`).
- `accion` (conjunto cerrado): `'creada' | 'notificacion_proveedor' | 'entrega' | 'entrega_rechazada' | 'no_encontrado' | 'comando_no_encontrado' | 'error'`.
- `chatIdUsuario` es `BigInt`: `JSON.stringify` lanza sobre `BigInt`. Convertir a `string` (o `Number` si cabe con seguridad) antes de loguear o responder.

## Máquina de estados

> La **fuente de verdad** de la lógica de entrega es la Regla 3. Esta lista solo
> enumera las transiciones permitidas; ante cualquier duda, manda el texto de la
> Regla 3.

Transiciones permitidas (`origen → destino` — quién la dispara):

- `pendiente_curp → pagado` — flujo de pago (fuera de alcance).
- `pagado → enviado_proveedor` — flujo de pago / endpoint dev.
- `enviado_proveedor → entregando` — claim de `entregar()`.
- `no_encontrado_proveedor → entregando` — claim de `entregar()` (el proveedor reintenta con éxito más tarde).
- `entregando → entregado` — `sendDocument` exitoso.
- `entregando → enviado_proveedor` — `sendDocument` falló; se revierte **exactamente al estado de origen** leído antes del claim.
- `entregando → no_encontrado_proveedor` — `sendDocument` falló; se revierte **exactamente al estado de origen** leído antes del claim.
- `enviado_proveedor → no_encontrado_proveedor` — `marcarNoEncontrado(esFinal=false)`.
- `enviado_proveedor → no_encontrado` — `marcarNoEncontrado(esFinal=true)`.
- `no_encontrado_proveedor → no_encontrado` — `marcarNoEncontrado(esFinal=true)`.

Cualquier transición no listada es inválida y debe rechazarse (log `entrega_rechazada`, sin lanzar error).

- **Estados cerrados** (rechazan cualquier nueva entrega/marcado, se registra el intento en `solicitud_logs` con `accion='entrega_rechazada'`, sin lanzar error): `entregado`, `no_encontrado`.
- **`entregando`** es transitorio: mientras una solicitud esté en `entregando`, cualquier otro intento de reclamarla falla el claim atómico (no se hace doble envío).
- **`no_encontrado_proveedor`** NO es cerrado: el proveedor todavía puede entregar el PDF más tarde.
- **Notificación al usuario final**: solo al entrar a `entregado` (se le envía el documento) o a `no_encontrado` (aviso de resultado final). Entrar a `no_encontrado_proveedor` NUNCA notifica al usuario.

## Reglas de negocio críticas

### 1. Estados internos vs. visibles al usuario
`no_encontrado_proveedor` y `entregando` son estados INTERNOS — nunca se notifican al usuario. Solo `entregado` o `no_encontrado` generan aviso al usuario.

### 2. Flujo conversacional del usuario + disparo a proveedor

**Flujo en Telegram (`lib/bot/flujoUsuario.ts`, llamado desde el webhook):**
- Menú con **ReplyKeyboard** (botones que envían texto): "📄 Iniciar trámite de
  gestoría" y "🔎 Consultar estado".
- `/start` (o texto vacío) → mensaje de bienvenida (copy legal + línea de
  privacidad de la CURP) + teclado. `Conversacion.paso = 'menu'`.
- **Iniciar** → `paso = 'esperando_curp'`; el siguiente texto se valida con
  `esCurpValida` (`lib/curp.ts`, formato local de 18 chars con códigos de
  entidad; **no** consulta RENAPO). Tras `MAX_REINTENTOS_CURP` CURP inválidas
  vuelve al menú. CURP válida → `solicitudService.crearSolicitud` (estado
  `pendiente_curp`, CURP normalizada, log `creada`) + mensaje de "solicitud
  registrada, costo, instrucciones de pago".
- **Consultar** → `paso = 'esperando_curp_consulta'`; con una CURP válida muestra
  el estado (mapa `estado → texto amable`) de las solicitudes **de ese chat**
  con esa CURP (privacidad: nunca las de otro chat).
- `/simular_pago` (solo `NODE_ENV != production`) → avanza la solicitud abierta
  del chat que esté en `pendiente_curp` llamando `solicitudService.enviarAProveedor`.

**`solicitudService.enviarAProveedor(id)`** (transición
`pendiente_curp | pagado → enviado_proveedor`, `updateMany` condicional): setea
`pagadoAt`/`enviadoProveedorAt`, log `notificacion_proveedor` (`canal='sistema'`),
y `sendMessage` al proveedor (`PROVEEDOR_TELEGRAM_CHAT_ID`) con id + CURP.

**`app/api/dev/solicitudes/route.ts` (POST)** — atajo para pruebas: crea y envía
al proveedor en un paso (`crearSolicitud` + `enviarAProveedor`). Body Zod
`{ chatIdUsuario, curp }`. Protegido con header `X-Dev-Secret` =
`TELEGRAM_WEBHOOK_SECRET`; 404 si `NODE_ENV === 'production'`. `runtime='nodejs'`.

**Enrutamiento en el webhook:** un mensaje se trata como **acción de proveedor**
solo si viene de `PROVEEDOR_TELEGRAM_CHAT_ID` **y** es un documento o empieza con
`NO `. Cualquier otro mensaje (de quien sea) va a `manejarMensajeUsuario`.

### 3. Servicio central `entregaActaService` (`lib/services/entregaActaService.ts`)

Expone:
- `entregar(solicitudId: number, fileId: string, canal: string): Promise<boolean>` — recibe un `file_id` de Telegram (nunca un buffer ni una ruta de archivo).
- `marcarNoEncontrado(solicitudId: number, canal: string, esFinal: boolean): Promise<boolean>`

**Patrón de entrega (claim atómico, sin llamadas de red dentro de una transacción):**

1. **Claim**:
   - Leer el estado actual con `const previo = await prisma.solicitud.findUnique({ where: { id: solicitudId }, select: { estado: true, chatIdUsuario: true } })` **inmediatamente antes** del claim. Guardar `previo.estado` en una variable local — es el único valor válido para revertir si falla `sendDocument` (el `updateMany` no devuelve de cuál de los dos estados de origen venía).
   - Claim atómico: `const { count } = await prisma.solicitud.updateMany({ where: { id: solicitudId, estado: { in: ['enviado_proveedor', 'no_encontrado_proveedor'] } }, data: { estado: 'entregando' } })`.
   - Si `count === 0`: la solicitud no estaba en un estado reclamable (ya cerrada, ya `entregando`, o inexistente). Registrar log `accion='entrega_rechazada'` con el motivo, **no lanzar error**, devolver `false`.
   - Nota de carrera: entre el `findUnique` y el `updateMany` otro proceso podría cambiar el estado; por eso la condición `estado IN (...)` del `updateMany` es la que garantiza exclusión mutua. `previo.estado` solo se usa para la reversión y, si el `updateMany` tuvo `count === 1`, el estado de origen real está garantizado a ser uno de los dos de la lista.
2. **Envío** (fuera de cualquier transacción): `telegramService.sendDocument({ chatId: chatIdUsuario, fileId, caption: <copy de entrega> })`.
3. **Confirmación**:
   - Éxito → `update` a `estado='entregado'`, `entregadoAt=now()`, `fileIdEntregado=<file_id devuelto por sendDocument>`, `metodoEntrega=canal`; log `accion='entrega'`; `telegramService.notificarAdmin(...)`. Devolver `true`.
   - Fallo de `sendDocument` → `update` a `estado: previo.estado` (el valor guardado en el paso 1, `enviado_proveedor` o `no_encontrado_proveedor`); log `accion='error'` con el detalle; devolver `false`. (No relanzar: el webhook siempre responde 200.)

**`marcarNoEncontrado`:**
- Rechazar si la solicitud ya está cerrada (`entregado` o `no_encontrado`) o en `entregando` → log `accion='entrega_rechazada'`, sin error, devolver `false`.
- `esFinal === false` → `estado='no_encontrado_proveedor'` (interno, sin aviso al usuario). Log `accion='no_encontrado'`, `canal` recibido.
- `esFinal === true` → `estado='no_encontrado'` (final). Log `accion='no_encontrado'`; enviar aviso al usuario final con copy conforme (ver Regla de copy); `notificarAdmin`.
- Usar `updateMany` condicional por estado (mismo criterio anti-carrera) en lugar de `read` + `update` sueltos.

**Semántica de retorno** (ambos métodos): `true` = la acción se completó ahora; `false` = no se completó pero ya quedó gestionada y registrada en `solicitud_logs`. Lanzar excepción solo ante error no recuperable de infraestructura (p. ej. DB caída), nunca por reglas de negocio.

### 4. Webhook de Telegram (`app/api/telegram/webhook/route.ts`)

- `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.
- **Siempre responder HTTP 200** salvo que el body no se pueda parsear como JSON (entonces 400). Todo error de negocio o de integración se maneja internamente, se loguea y se responde 200 (Telegram reintct­a el `update` si no recibe 2xx).
- **Secret**: validar el header `X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_WEBHOOK_SECRET`. Si no coincide: responder 200 sin hacer nada (no filtrar información).
- **Autorización del proveedor**: para procesar documentos o el comando `NO`, el `message.chat.id` debe ser `PROVEEDOR_TELEGRAM_CHAT_ID`. Si no, ignorar (200) — opcionalmente `notificarAdmin` de un intento no autorizado.

**a) Documento del proveedor (`message.document`):**
- Leer y `trim` del `message.caption`.
  - Si el caption `trim` es un entero puro (`/^\d+$/`) → match por `solicitudes.id`.
  - Si el caption `trim` hace `/^[A-Za-z0-9]{18}$/` → normalizar a mayúsculas y match por `solicitudes.curp`. Considerar solo solicitudes en estado `enviado_proveedor` o `no_encontrado_proveedor`.
    - 0 resultados → sin match.
    - 1 resultado → match.
    - >1 resultado → ambiguo.
  - Cualquier otra forma, o caption vacío → sin match.
- Si **no hay caption, no hay match, o el match es ambiguo**: NO reenviar nada; `notificarAdmin` con el detalle (`file_id`, motivo, caption recibido); **ack al proveedor** con `sendMessage` (`"⚠️ Recibí el documento pero no pude identificar la solicitud (caption: «<caption>»). Reenvíalo con el ID de solicitud en el caption."`); registrar en `solicitud_logs` (`accion='error'`, `canal='telegram_proveedor'`) si hay una solicitud identificable, o solo notificar al admin si no la hay.
- Si hay match: extraer `message.document.file_id` directo del payload (SIN `getFile` ni descarga) y llamar `entregaActaService.entregar(solicitudId, file_id, 'telegram_proveedor')`.

**b) Comando de texto del proveedor (`message.text`):**
- Formato: `NO <id|CURP>` (case-insensitive en la palabra `NO`, un solo espacio o varios). Ejemplos: `NO 123`, `no ABCD123456HDFXYZ01`.
- Resolver `<id|CURP>` igual que el caption (entero → `id`; 18 alfanum → `curp` entre estados `enviado_proveedor`/`no_encontrado_proveedor`).
- Al resolver a una solicitud: llamar `entregaActaService.marcarNoEncontrado(solicitudId, 'telegram_proveedor', esFinal=false)`. (El paso a `no_encontrado` final lo decide el admin en otra vía; fuera de alcance el comando para `esFinal=true`.)
- Registrar log `accion='comando_no_encontrado'` cuando el comando resuelva a una solicitud.
- **Ack al proveedor** — tras todo comando `NO`, responder SIEMPRE al chat del proveedor (`sendMessage`) con el resultado, además de cualquier `notificarAdmin`:
  - resuelto y `marcarNoEncontrado` devolvió `true` → `"✅ Solicitud #<id> marcada como no encontrada. Puedes reintentar la entrega más tarde."`
  - resuelto pero `marcarNoEncontrado` devolvió `false` (solicitud ya cerrada o en `entregando`) → `"⚠️ La solicitud #<id> ya está cerrada o en proceso; no se hizo ningún cambio."`
  - `id`/`CURP` sin coincidencia → `"⚠️ No encontré ninguna solicitud para «<valor>»."`
  - `CURP` con match ambiguo (>1 solicitud abierta) → `"⚠️ «<CURP>» tiene varias solicitudes abiertas (#a, #b). Responde con NO <id>."` y `notificarAdmin` con el detalle; no actuar.
  - formato inválido (empieza con `NO ` pero el resto no es entero ni CURP de 18) → `"⚠️ Formato no válido. Usa: NO <id> o NO <CURP>."`
- Cualquier otro texto que no empiece con `NO ` (o `no `): ignorar (200), sin ruido y sin ack.

### 5. Panel web del proveedor

**Auth (Auth.js v5, `next-auth@beta`):**
- Provider **Credentials** (email + contraseña). `authorize` valida con Zod,
  `prisma.usuario.findUnique({ where: { email } })`, chequea `activo`, y
  `bcryptjs.compare`. Devuelve `{ id, email, name, role: usuario.rol }` o `null`.
- Sesión **JWT** en cookie (`session.strategy = 'jwt'`), sin adapter de DB.
  `role` viaja en el token.
- Config partida en dos: `auth.config.ts` (edge-safe, sin prisma/bcrypt, para el
  `middleware.ts`) y `auth.ts` (config completa con el provider). `middleware.ts`
  protege `/proveedor/**` (sesión) y `/admin/**` (rol `admin`; un proveedor
  autenticado es redirigido a `/proveedor`).
- Alta de cuentas: `npm run usuario:crear -- --rol admin|proveedor` (no hay
  registro público). `lib/sesion.ts` expone `requireProveedor()` y `requireAdmin()`.

**Páginas (`app/proveedor/`):**
- `/proveedor/login` — form email/contraseña → `signIn('credentials', ...)`.
- `/proveedor` — lista las solicitudes en `enviado_proveedor` o
  `no_encontrado_proveedor` (orden `enviadoProveedorAt` asc). Por fila: subir PDF
  (form `multipart/form-data` a la ruta de abajo) o **"Marcar no encontrada"**
  (server action → `entregaActaService.marcarNoEncontrado(id, 'panel_web', false)`
  → `revalidatePath`).

**Ruta de subida — `app/api/proveedor/solicitudes/[id]/entregar/route.ts`**
(`runtime='nodejs'`, `dynamic='force-dynamic'`), patrón **pass-through**:
- `await auth()`; sin sesión → `401`.
- `await req.formData()` → toma el `File` (campo `archivo`). Valida: presente,
  `type === 'application/pdf'` (o nombre `.pdf`), `size ≤ MAX_PDF_BYTES` (4 MB;
  nota: límite ~4.5 MB de una función serverless de Vercel).
- Llama `entregaActaService.entregarConEnvio(id, 'panel_web', (chatId) =>
  telegramService.sendDocumentBinary({ chatId, file, filename, caption:
  CAPTION_ENTREGA }), { proveedorId })`. El `File` se reenvía directo a
  `sendDocument` de la Bot API y se descarta al terminar el request.
- **Nunca** `fs.writeFile`, buffer a disco, bucket ni cola.
- Éxito → `redirect('/proveedor?entregada=<id>', 303)`; error de validación →
  `?error=...`.

**Núcleo compartido:** `entregaActaService.entregarConEnvio(solicitudId, canal,
enviar, opts?)` contiene el claim atómico y la reversión (misma lógica que la
Regla 3); recibe un callback `enviar(chatId) => Promise<file_id>` que hace el
envío real. `entregar(id, fileId, canal)` (flujo Telegram) queda como wrapper que
pasa `() => telegramService.sendDocument({ ... })`.

### 6. Nunca automatizar scraping del sitio oficial de RENAPO
No debe existir código que interactúe automáticamente con `consultas.curp.gob.mx` ni ningún portal gubernamental.

### 7. Conciliación semanal y panel de administración

**Corte semanal** (`lib/corte.ts`): lunes 00:00 a domingo 23:59:59.999, hora de
Ciudad de México (**UTC-6 fijo** — México sin horario de verano desde 2022). El
proveedor entrega toda la semana y el corte se revisa los domingos.

**`lib/services/conciliacionService.ts`**:
- `filasDeCorte(semana)` — una fila por `Solicitud` `entregado` con `entregadoAt`
  en el rango: `esperado` = `costoProveedorEsperado` congelado, o
  `tarifaVigente(proveedor, servicio, entregadoAt)` mientras el corte esté
  abierto; `real` = `costoProveedorReal`; `diferencia` = `real - esperado`.
- `totales(filas)` — el "score": nEntregadas, nFacturadas, nSinConciliar,
  nConDiferencia, ΣEsperado, ΣReal, ΣDiferencia.
- `capturarFactura(solicitudId, monto, adminId)` — captura manual del costo que
  el proveedor factura **por trámite**. Rechaza si la solicitud está en un corte
  cerrado.
- `cerrarCorte(semana, adminId)` — crea el `Corte`, congela
  `costoProveedorEsperado` y `corteId` por solicitud, guarda los totales y marca
  `cerradoAt/Por`. `reabrirCorte(id, adminId)` lo desbloquea.

**`lib/services/tarifaService.ts`**: `tarifaVigente(...)`; `ponerTarifa(...)`
(cierra la vigente y crea la nueva).

**Panel `/admin/**`** (rol admin; mismo sistema visual que `/proveedor`):
- `/admin` — KPIs de la semana en curso + lista de las últimas ~8 semanas
  (rango, abierto/cerrado, score).
- `/admin/cortes/[YYYY-MM-DD]` — tabla de entregas del corte con captura inline
  del `real`, asignación de proveedor si falta, y botón **Cerrar / Reabrir corte**.
- `/admin/tarifas` — tarifa vigente + historial por proveedor; alta de tarifa.
- `/admin/servicios` — editar `nombre` y `precioUsuario` por servicio.
- `app/admin/actions.ts` — server actions, todas con `requireAdmin()`.

El precio que ve el usuario en el bot sale de `Servicio.precioUsuario` (ya no de
una constante).

## Regla de copy — terminología legal obligatoria

Todos los mensajes visibles al usuario final (bot de Telegram), la descripción/"about" del bot y todo texto de UI deben usar consistentemente el término **"gestoría de acta de nacimiento"** (o variantes como "servicio de gestoría", "trámite de gestoría") para dejar explícito que el sistema es un intermediario que gestiona el trámite, no una entidad gubernamental ni el emisor oficial del documento. Evitar frases que sugieran que el sistema "expide", "genera" o "emite" el acta.

Ejemplos:
- ✅ "Tu solicitud de gestoría de acta de nacimiento fue registrada"
- ❌ "Tu acta de nacimiento está siendo generada"
- ✅ Caption de entrega: **"Aquí está el resultado de tu gestoría de acta de nacimiento."**
- ❌ "Estamos emitiendo tu acta de nacimiento"
- ✅ Aviso de no encontrado (final): "No fue posible completar la gestoría de tu acta de nacimiento. Te contactaremos para el reembolso."

Aplica a: mensajes del bot, notificaciones al proveedor, textos del panel web, mensajes de error/estado, descripción del bot.

## Servicio de Telegram (`lib/services/telegramService.ts`)
Encapsular llamadas a la Bot API usando `fetch` nativo y `TELEGRAM_BOT_TOKEN`:
- `sendMessage({ chatId, text, replyMarkup?, parseMode? })` — `replyMarkup` se
  serializa en `reply_markup`. Helpers `tecladoMenu()` (ReplyKeyboardMarkup) y
  `quitarTeclado()`.
- `sendDocument({ chatId, fileId, caption? })` — reenvío por `file_id`.
- `sendDocumentBinary({ chatId, file, filename, caption? })` — pass-through del panel: arma el `FormData` internamente y devuelve el `file_id` resultante.
- `notificarAdmin(text)` — `sendMessage` a `ADMIN_TELEGRAM_CHAT_ID`.
- NO incluir método de descarga de archivos (`getFile` + descarga binaria) — no se usa en ningún flujo.
- Al construir payloads, convertir cualquier `BigInt` (`chatId`) a `string`/`Number` explícitamente.

## Qué construir en esta sesión
1. `lib/prisma.ts` (singleton de `PrismaClient`) + `prisma/schema.prisma` con el modelo de arriba, `provider = "postgresql"`, `url`/`directUrl`.
2. `lib/services/telegramService.ts` (sin método de descarga de archivos).
3. `lib/services/entregaActaService.ts` con el patrón claim atómico (`entregando`) descrito en la Regla 3.
4. `app/api/telegram/webhook/route.ts` — validación de secret, autorización de proveedor, manejo de documentos (file_id directo, reglas de caption) y del comando `NO <id|CURP>`; siempre responde 200; `runtime='nodejs'`.
5. `app/api/dev/solicitudes/route.ts` — simulación del disparo a proveedor (Regla 2).
6. `.env.example` con todas las variables de la tabla de arriba.
7. **Tests Vitest — `entregaActaService`:**
   - entrega exitosa (claim + sendDocument ok + estado `entregado` + log + notifica admin);
   - solicitud ya cerrada (`entregado`/`no_encontrado`) → `false`, log `entrega_rechazada`, sin error;
   - condición de carrera: dos llamadas `entregar` simultáneas sobre la misma solicitud → solo una hace el claim y entrega, la otra devuelve `false`;
   - fallo de `sendDocument` partiendo de `enviado_proveedor` → estado revertido a `enviado_proveedor`, log `error`, `false`;
   - fallo de `sendDocument` partiendo de `no_encontrado_proveedor` → estado revertido a `no_encontrado_proveedor` (no a `enviado_proveedor`), log `error`, `false`;
   - `marcarNoEncontrado(esFinal=false)` → `no_encontrado_proveedor`, sin aviso al usuario;
   - `marcarNoEncontrado(esFinal=true)` → `no_encontrado`, con aviso al usuario.
8. **Tests Vitest — webhook:**
   - secret inválido → 200, sin efectos;
   - remitente no autorizado → ignorado;
   - caption vacío → no reenvía, notifica admin;
   - caption sin match → no reenvía, notifica admin;
   - match por ID → llama `entregar` con el `file_id` del payload;
   - match por CURP (1 solicitud) → llama `entregar`;
   - match por CURP ambiguo (>1 solicitud) → no reenvía, notifica admin;
   - comando `NO 123` (resuelve) → llama `marcarNoEncontrado(123, 'telegram_proveedor', false)` y manda ack `✅` al proveedor;
   - comando `NO 999` (id inexistente) → no llama al servicio, manda ack `⚠️ No encontré...` al proveedor;
   - comando `NO 123` sobre solicitud ya `entregado` → servicio devuelve `false`, ack `⚠️ ...ya está cerrada...` al proveedor;
   - comando `NO abc` (formato inválido) → ack `⚠️ Formato no válido...`, sin tocar la DB;
   - texto que no empieza con `NO ` → 200, sin ack ni efectos.
9. **Estrategia de test**: mockear `global.fetch` (o inyectar/mockear `telegramService`) — ninguna llamada real a la Bot API. Base de datos: mock del cliente Prisma (Prisma falso en memoria con `updateMany` condicional real).
10. **Panel web del proveedor:** `auth.config.ts` + `auth.ts` (Auth.js v5) + `middleware.ts` + `app/api/auth/[...nextauth]/route.ts`; páginas `app/proveedor/login` y `app/proveedor` (+ layout, `actions.ts`, css); modelo `Proveedor` en el schema; `scripts/crear-proveedor.mjs` + script npm `proveedor:crear`.
11. **Ruta de subida** `app/api/proveedor/solicitudes/[id]/entregar/route.ts` (pass-through) + refactor `entregaActaService.entregarConEnvio` + `telegramService.sendDocumentBinary`.
12. **Tests Vitest — panel:**
    - PDF válido con sesión → `sendDocumentBinary`, solicitud `entregado`, `metodoEntrega='panel_web'`, `proveedorId` seteado, log `entrega`, redirect 303;
    - sin sesión → `401`, sin cambios;
    - archivo no-PDF o mayor a `MAX_PDF_BYTES` → `4xx`, sin llamar a Telegram;
    - solicitud ya cerrada → servicio devuelve `false`, redirect con `?error`;
    - `entregarConEnvio` con `enviar` que lanza desde `no_encontrado_proveedor` → revierte a ese estado.
13. **Flujo conversacional del usuario:** modelo `Conversacion` + `lib/curp.ts` +
    `lib/services/conversacionService.ts` + `lib/services/solicitudService.ts` +
    `lib/bot/flujoUsuario.ts`; enrutamiento proveedor/usuario en el webhook;
    comando dev `/simular_pago`; `MAX_REINTENTOS_CURP` en `lib/config.ts`.
14. **Tests Vitest — flujo usuario:**
    - `/start` → bienvenida + teclado, `Conversacion` en `menu`;
    - botón Iniciar → `esperando_curp`, pide CURP;
    - CURP inválida × `MAX_REINTENTOS_CURP` → vuelve al menú;
    - CURP válida (minúsculas) → crea `Solicitud` `pendiente_curp` (CURP en mayúsculas);
    - `/simular_pago` → `enviado_proveedor` + notifica al proveedor + `pagoConfirmado`;
    - Consultar + CURP propia → estado; CURP de otro chat → sin resultados (privacidad);
    - texto no reconocido en `menu` → `noEntiendo`;
    - webhook: `/start` desde el chat del proveedor → flujo de usuario (no se ignora).
15. **Conciliación + admin (Regla 7):** `Usuario`+rol / `Servicio` / `Tarifa` /
    `Corte` en el schema + campos de conciliación en `Solicitud`; `lib/corte.ts`,
    `lib/dinero.ts`, `lib/services/{servicioService,tarifaService,conciliacionService}.ts`;
    `app/admin/**`; `lib/proveedorSesion.ts` → `lib/sesion.ts`;
    `scripts/crear-proveedor.mjs` → `crear-usuario.mjs` con `--rol`.
16. **Tests Vitest — conciliación / admin:**
    - `tarifaVigente` elige por fecha; `ponerTarifa` cierra la anterior;
    - `filasDeCorte` + `totales` calculan esperado/real/diferencia y el score;
    - `capturarFactura` ok en corte abierto, rechaza en corte cerrado;
    - `cerrarCorte` congela y bloquea; `reabrirCorte` desbloquea;
    - `requireAdmin` redirige a `/proveedor` (rol proveedor) o a login (sin sesión).

## Fuera de alcance en esta sesión
- Integración real de pasarela de pago (se simula con `/simular_pago` y el endpoint dev).
- Registro/gestión de cuentas desde el navegador (el alta es por CLI); alta de
  **nuevos servicios** por UI (se hace por migración).
- Multi-servicio en el bot (el flujo sigue siendo solo acta de nacimiento).
- Importación de la factura del proveedor por archivo (se captura a mano, por trámite).
- Comando/flujo para marcar `no_encontrado` **final** (`esFinal=true`); el sistema solo cubre el marcado interno.
- Cualquier forma de storage o descarga de archivos — el sistema es intencionalmente "sin storage".
