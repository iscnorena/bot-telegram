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
- Base de datos: MySQL (PlanetScale o Railway, host externo) vía Prisma ORM
  - Cliente Prisma como **singleton** en `lib/prisma.ts` (evita agotar conexiones en serverless).
  - Para MySQL de host externo, usar `connection_limit` bajo en el `DATABASE_URL` (p. ej. `?connection_limit=5`).
- Bot: Telegram Bot API vía webhook — Route Handler en `app/api/telegram/webhook/route.ts`
- **Storage de archivos: NINGUNO.** Los PDFs nunca se persisten en el backend — ver sección "Manejo de archivos sin storage" abajo.
- Panel web proveedor: páginas Next.js (App Router) con Auth.js (NextAuth) para login con roles — **fuera de alcance en esta sesión**
- Validación: Zod
- Tests: **Vitest**
- Despliegue: Vercel (entorno de pruebas, sin VPS por ahora)
- Todos los Route Handlers que tocan Prisma deben declarar `export const runtime = 'nodejs'` y `export const dynamic = 'force-dynamic'` (Prisma no corre en el runtime Edge).

## Variables de entorno (`.env.example`)

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión MySQL para Prisma. Incluir `connection_limit` bajo. |
| `TELEGRAM_BOT_TOKEN` | Token del bot para todas las llamadas a la Bot API. |
| `TELEGRAM_WEBHOOK_SECRET` | Valor esperado en el header `X-Telegram-Bot-Api-Secret-Token` del webhook. También protege el endpoint dev. |
| `PROVEEDOR_TELEGRAM_CHAT_ID` | `chat.id` autorizado como proveedor (documentos y comando `NO`). |
| `ADMIN_TELEGRAM_CHAT_ID` | `chat.id` al que se envían todas las notificaciones de `notificarAdmin`. |

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
```

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

### 2. Punto de disparo de notificación al proveedor + endpoint de simulación
Cuando la solicitud pasa a `enviado_proveedor`, enviar automáticamente un mensaje de Telegram al proveedor (`PROVEEDOR_TELEGRAM_CHAT_ID`) con el ID de solicitud y la CURP.

Como la pasarela de pago está fuera de alcance, este punto se simula con:

**`app/api/dev/solicitudes/route.ts` (POST)** — crea una solicitud directamente en estado `enviado_proveedor`:
- Body validado con Zod: `{ chatIdUsuario: number|string, curp: string, nombre?, apellidoPaterno?, apellidoMaterno? }`.
- Normaliza `curp` a mayúsculas antes de guardar.
- Protegido: exige header `X-Dev-Secret` (o `Authorization: Bearer ...`) igual a `TELEGRAM_WEBHOOK_SECRET`; responde 404/deshabilitado si `process.env.NODE_ENV === 'production'`.
- Al crear: setea `enviadoProveedorAt = now()`, registra log `accion='creada'` y luego `accion='notificacion_proveedor'` (`canal='sistema'`), y dispara el `sendMessage` al proveedor.
- `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.

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

### 5. Endpoint del panel web para subir el PDF (`app/api/proveedor/solicitudes/[id]/entregar/route.ts`)
**NO se construye en esta sesión** (requiere Auth.js). Guía para cuando se construya: seguir el patrón pass-through — recibir `multipart/form-data`, validar tamaño, reenviarlo inmediatamente como `multipart/form-data` a `sendDocument` de la Bot API, tomar el `file_id` de la respuesta de Telegram, pasarlo a `entregaActaService.entregar(id, file_id, 'panel_web')`, y descartar el buffer. Nunca usar `fs.writeFile` ni ningún cliente de storage.

### 6. Nunca automatizar scraping del sitio oficial de RENAPO
No debe existir código que interactúe automáticamente con `consultas.curp.gob.mx` ni ningún portal gubernamental.

## Regla de copy — terminología legal obligatoria

Todos los mensajes visibles al usuario final (bot de Telegram), la descripción/"about" del bot y todo texto de UI deben usar consistentemente el término **"gestoría de acta de nacimiento"** (o variantes como "servicio de gestoría", "trámite de gestoría") para dejar explícito que el sistema es un intermediario que gestiona el trámite, no una entidad gubernamental ni el emisor oficial del documento. Evitar frases que sugieran que el sistema "expide", "genera" o "emite" el acta.

Ejemplos:
- ✅ "Tu solicitud de gestoría de acta de nacimiento fue registrada"
- ❌ "Tu acta de nacimiento está siendo generada"
- ✅ Caption de entrega: **"Aquí está el resultado de tu gestoría de acta de nacimiento."**
- ❌ "Estamos emitiendo tu acta de nacimiento"
- ✅ Aviso de no encontrado (final): "No fue posible completar la gestoría de tu acta de nacimiento. Te contactaremos para el reembolso."

Aplica a: mensajes del bot, notificaciones al proveedor, textos del panel (cuando se construya), mensajes de error/estado, descripción del bot.

## Servicio de Telegram (`lib/services/telegramService.ts`)
Encapsular llamadas a la Bot API usando `fetch` nativo y `TELEGRAM_BOT_TOKEN`:
- `sendMessage({ chatId, text })`
- `sendDocument({ chatId, fileId, caption? })` — reenvío por `file_id`.
- `sendDocument` variante que acepta `FormData` — para el pass-through del panel (aunque el endpoint no se construya esta sesión, el método sí puede existir).
- `notificarAdmin(text)` — `sendMessage` a `ADMIN_TELEGRAM_CHAT_ID`.
- NO incluir método de descarga de archivos (`getFile` + descarga binaria) — no se usa en ningún flujo.
- Al construir payloads, convertir cualquier `BigInt` (`chatId`) a `string`/`Number` explícitamente.

## Qué construir en esta sesión
1. `lib/prisma.ts` (singleton de `PrismaClient`) + `schema.prisma` con el modelo de arriba + conexión a MySQL externo.
2. `lib/services/telegramService.ts` (sin método de descarga de archivos).
3. `lib/services/entregaActaService.ts` con el patrón claim atómico (`entregando`) descrito en la Regla 3.
4. `app/api/telegram/webhook/route.ts` — validación de secret, autorización de proveedor, manejo de documentos (file_id directo, reglas de caption) y del comando `NO <id|CURP>`; siempre responde 200; `runtime='nodejs'`.
5. `app/api/dev/solicitudes/route.ts` — simulación del disparo a proveedor (Regla 2).
6. `.env.example` con las 5 variables de la tabla de arriba.
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
9. **Estrategia de test**: mockear `global.fetch` (o inyectar/mockear `telegramService`) — ninguna llamada real a la Bot API. Base de datos: SQLite en memoria vía Prisma, o mock del cliente Prisma, según convenga a cada test.

## Fuera de alcance en esta sesión
- Flujo conversacional completo del bot para el usuario final (menús, captura de CURP, consulta de CURP).
- Integración de pasarela de pago (se simula con el endpoint dev).
- Panel web del proveedor: login, páginas, Auth.js y el endpoint de subida `app/api/proveedor/solicitudes/[id]/entregar/route.ts` — no se tocan.
- Comando del proveedor para marcar `no_encontrado` **final** (`esFinal=true`); esta sesión solo cubre el marcado interno vía comando.
- Cualquier forma de storage o descarga de archivos — el sistema es intencionalmente "sin storage".
