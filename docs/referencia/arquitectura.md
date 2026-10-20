# Arquitectura y seguridad

> **Audiencia:** desarrollo y operación técnica.
> **Estado:** vigente.
> **Fuente canónica de:** componentes, seguridad de aplicación, almacenamiento,
> PWA y arquitectura de despliegue.

Los endpoints concretos están en [`api.md`](api.md), las variables en
[`variables-entorno.md`](variables-entorno.md) y los pasos operativos en
[`../guias/instalacion.md`](../guias/instalacion.md) y
[`../guias/operacion.md`](../guias/operacion.md).

## 1. Arquitectura de referencia

Lumen es un **monolito SvelteKit**: una sola aplicación entrega UI, endpoints,
sesiones, lógica de negocio, acceso a PostgreSQL y archivos. No hay
microservicios, Redis, S3, Firebase ni colas externas obligatorias.

```text
[ Navegador / PWA instalada ]
          │ HTTPS
          ▼
[ Cloudflare Tunnel (o proxy TLS opcional) ]
          │
          ▼
[ SvelteKit + adapter-node ]
   ├── UI SSR + navegación cliente
   ├── acciones y endpoints autenticados
   ├── servicios de dominio y transacciones
   ├── procesamiento de fotos, ZIP, XLSX y PDF
   ├── Drizzle ──────────────────────────────► [ PostgreSQL ]
   ├── archivos ─────────────────────────────► [ Volumen local de fotos ]
   └── Web Push estándar ────────────────────► [ Servicio push del navegador ]
```

Las **escrituras requieren conexión**. El service worker cachea recursos
estáticos y una página de consulta offline; los datos de estructura y estado se
guardan en IndexedDB. No hay cola offline ni sincronización de escrituras.

## 2. Estructura del proyecto

```text
lumen/
├── src/
│   ├── lib/
│   │   ├── components/             # componentes compartidos y shadcn-svelte
│   │   ├── evidence/               # reglas compartidas de envío y checklist
│   │   ├── server/
│   │   │   ├── auth/               # sesiones, hashes y guards
│   │   │   ├── db/                 # conexión, schema y queries Drizzle
│   │   │   ├── domain/             # reglas de negocio y transacciones
│   │   │   ├── exports/            # ZIP, XLSX y PDF
│   │   │   ├── notifications/      # inbox y Web Push
│   │   │   └── storage/            # fotos, miniaturas y limpieza
│   │   ├── schemas/                # validaciones compartidas sin secretos
│   │   └── types.ts
│   ├── routes/
│   │   ├── (auth)/login/
│   │   ├── (setup)/setup/
│   │   ├── (app)/dashboard/
│   │   ├── (app)/search/
│   │   ├── (app)/contracts/
│   │   ├── (app)/services/[serviceId]/
│   │   ├── (app)/works/[workId]/
│   │   ├── (app)/elements/[elementId]/
│   │   ├── (app)/admin/{users,catalogs,services}/
│   │   └── api/                    # fotos, descargas, push, health
│   ├── hooks.server.ts
│   └── env.ts                      # validación de variables
├── drizzle/                        # migraciones versionadas
├── e2e/                            # Playwright
├── tests/integration/              # PostgreSQL real
├── scripts/                        # migración, limpieza, VAPID, iconos, E2E
├── static/                         # iconos, manifest, sw.js, robots.txt
├── Dockerfile
├── compose.yaml
├── compose.dev.yaml
├── .env.example
└── deploy/                         # backup, restore y utilidades
```

Los imports internos usan el alias `#lib` (`#lib/*`). Los componentes de
shadcn-svelte quedan exentos de la regla de navegación con `resolve()`.

## 3. Stack y compatibilidad

- **Svelte 5** con runes y **SvelteKit 3** con `@sveltejs/adapter-node`.
- **TypeScript 6** estricto.
- **Tailwind CSS 4** y **shadcn-svelte** (estilo `nova`, base `neutral`).
- **Drizzle ORM/Kit** con `postgres.js` y migraciones versionadas.
- **PostgreSQL 17** con `timestamptz`, FKs, índices y transacciones.
- **Zod 4** para validación de entrada.
- **Argon2id** (`@node-rs/argon2`) para contraseñas.
- **Sharp** para normalización de imágenes y miniaturas.
- **Archiver** para ZIP en streaming; **exceljs** y **pdf-lib** para XLSX y PDF.
- **Web Push** estándar con VAPID y service worker propio en `static/sw.js`.
- **Vitest** para unitarias e integración; **Playwright** para E2E.

Las versiones exactas viven en `package.json` y el lockfile. No se fijan números
de versión en la documentación salvo que sean parte de una decisión operativa.

## 4. Módulos internos

### Autenticación y autorización

`getSessionUser(request)` devuelve el usuario activo real de la sesión.
`requireAdmin()`, `requireContractAccess(contractId)`,
`requireContractManage(contractId)`, `requireServiceAccess(serviceId)`,
`requireCapture(targetId)`, `requireReview(submissionId)` y
`requireExportZip()` actúan **antes** de recuperar o transferir datos sensibles.

- **Administrador:** todas las operaciones autorizadas por rol.
- **Técnico:** captura, envía y consulta/descarga fotos en servicios asignados y
  siendo miembro de su contrato. No revisa ni exporta ZIP.
- **Supervisor:** revisa y consulta/descarga en servicios asignados y siendo
  miembro de su contrato. No captura. Puede gestionar asignaciones de servicio
  dentro de sus contratos.
- **Usuario desactivado:** sin acceso aunque la cookie no haya expirado.

El ámbito se comprueba también en búsqueda, miniaturas, ZIP, historial, enlaces
profundos y acciones de mutación.

### Ámbito por contrato

La jerarquía es **contrato → servicio → trabajo/elemento**. El contrato agrupa
servicios y define a sus participantes.

- `getContractAccess` y `visibleContractIds` resuelven la pertenencia (admin
  global o `contract_assignments` activas) y devuelven `404` opaco fuera de
  ámbito.
- La visibilidad de un servicio exige asignación de servicio activa **y**
  pertenencia activa al contrato con el mismo rol.
- Asignar un servicio valida la pertenencia al contrato.
- Revocar una asignación de contrato revoca en cascada las de servicio dentro del
  contrato.

### Servicios y catálogos

Un servicio de dominio central orquesta cambios estructurales e invariantes:
`createService`, `assignUser`, `createWork`, `createElementsBulk`,
`convertWorkMode`, `detachCatalogItem`, `deleteWorkWithImpact`.

### Evidencia

Funciones servidor como `appendPhoto`, `removePhoto`, `reorderPhotos`,
`validateRequirements`, `submitEvidence`, `reviewSubmission` y `getHistory`
resuelven el target canónico para que directo y dividido compartan lógica. Nunca
se acepta `current_status='approved'` por un endpoint genérico.

### Exportaciones

`buildExportPlan(scope)` calcula rutas y agregados; `exportSubmissionZip`,
`exportWorkZip`, `exportServiceZip` y `exportContractZip` generan los ZIP.
`buildWorkbook` produce el XLSX y `buildWorkPdf` el PDF por trabajo. Los detalles
funcionales están en [`exportaciones.md`](exportaciones.md).

## 5. Carga y ciclo de vida de fotografías

1. El cliente adjunta JPEG, PNG o WebP; HEIC solo si la compilación lo soporta.
2. El backend valida autorización, límites por archivo y tipo detectado por
   contenido, no solo extensión o MIME declarado.
3. El archivo va a un staging no público con nombre aleatorio y cuota.
4. Se normaliza la orientación, se eliminan metadatos sensibles, se optimiza a
   un formato persistente y se genera una miniatura.
5. Al completar ambos archivos se mueve atómicamente al almacenamiento final y
   se registra `photos.processing_status='ready'`.
6. Solo las fotos `ready` entran en una entrega.

### Rutas internas

Ejemplo no accesible por HTTP directo:

```text
/data/photos/
├── objects/
│   └── ab/cd/<photo-uuid>.jpg
├── thumbnails/
│   └── ab/cd/<photo-uuid>.webp
├── staging/
└── export-temp/
```

- Se usan IDs generados y rutas canónicas, nunca nombres o paths del cliente.
- El volumen persistente se monta explícitamente; el contenedor corre con
  permisos mínimos.
- Las fotos de snapshots históricos son inmutables en contenido.
- La limpieza de archivos no referenciados se ejecuta tras comprobar FKs y
  después del commit.
- La eliminación destructiva de un ámbito libera archivos sin referencias
  **después** de la transacción SQL.

### Límites

- Tamaño máximo por archivo configurable (`MAX_UPLOAD_BYTES`, 25 MiB por
  defecto).
- Límite de cuerpo HTTP de adapter-node (`BODY_SIZE_LIMIT`, 30 MB en Compose).
- Dimensiones máximas y de miniatura configurables.
- No hay máximo funcional de fotos por grupo u objetivo.
- El disco lleno y los formatos incompatibles se comunican con errores
  accionables.

## 6. Exportaciones y archivos

- Las fotos se sirven con `GET` autenticado, `Content-Type` seguro,
  `Cache-Control` privado y `Content-Disposition` en descargas.
- Los ZIP recorren `submission_photos` ordenadas y copian binarios; no se cargan
  en RAM.
- Los ZIP de ámbito incluyen solo la última entrega aprobada de cada objetivo.
- El XLSX y el PDF se generan con `exceljs` y `pdf-lib`; los detalles de formato
  están en [`exportaciones.md`](exportaciones.md).
- Los nombres de carpetas se sanean y desambiguan para evitar traversal,
  colisiones y ZIP Slip.
- Los temporales se eliminan aunque el cliente corte la conexión.

## 7. Seguridad de aplicación

- Contraseñas con Argon2id, sal aleatoria y política mínima razonable.
- Rate limiting en login, setup y subidas; en memoria por instancia.
- Sesiones de servidor en cookies `HttpOnly`, `Secure` bajo HTTPS y `SameSite`.
- Protección CSRF y verificación de `Origin` en mutaciones; no se usa
  `localStorage` para autenticación.
- Autorización centralizada por servicio, aplicada también a miniaturas,
  historial y búsqueda.
- Validación estricta de inputs con esquemas; nunca se aceptan `uploaded_by`,
  `reviewer_id` o `approved=true` como autoridad del cliente.
- CSP razonable, escaping, protección XSS y cabeceras de seguridad.
- Paths de exportación saneados; sin traversal ni lectura arbitraria.
- Logs sin credenciales, tokens, contraseñas ni claves VAPID.
- La autorización se revalida al descargar, aunque el contenido esté
  precalculado.

## 8. PWA y Web Push

### PWA

- Manifest instalable con nombre `Lumen`, `short_name`, iconos y modo
  `standalone`.
- Iconos PWA 192/512, maskable 512, apple-touch 180, monocromo 512 y badge 96.
- Se regeneran con `pnpm icons:generate` desde los SVG de `static/icons`.
- `static/sw.js` cachea recursos estáticos y la página `/offline.html`; no cachea
  fotos privadas, respuestas autenticadas ni formularios editables.
- El snapshot de consulta offline se guarda en IndexedDB, separado por usuario y
  con caducidad de 7 días. Se borra al cerrar sesión.
- Sin conexión se muestra un aviso; las acciones que requieren servidor quedan
  deshabilitadas y no simulan éxito.
- No se cachea evidencia privada ni el snapshot de otro usuario.

### Web Push

1. El despliegue genera un par de claves VAPID; la pública llega al navegador y
   la privada queda solo en el servidor.
2. El usuario concede permiso explícito. Se registra una suscripción por
   dispositivo contra su cuenta.
3. En un envío o revisión se insertan las notificaciones internas dentro de la
   transacción.
4. Tras el commit se envía el push a las suscripciones activas. Las inválidas se
   eliminan.
5. El service worker muestra la notificación y abre una ruta relativa; el
   servidor revalida permisos.

**Limitaciones:** Web Push depende del navegador y del sistema. No funciona sin
red ni está garantizado en todos los navegadores. En iOS suele requerir instalar
la PWA en la pantalla de inicio. La bandeja interna sigue funcionando sin push.
No se añade Firebase como dependencia obligatoria.

## 9. Docker y despliegue

```text
compose.yaml
  db:      PostgreSQL 17, volumen postgres_data, healthcheck,
           red privada, sin puerto publicado
  migrate: runner de Drizzle, termina antes de arrancar la app
  app:     SvelteKit/Node, imagen GHCR, healthcheck,
           volumen lumen_photos en /data/photos,
           red externa proxy como lumen:3000, sin puerto de host
```

- Cloudflare Tunnel reenvía el dominio a `lumen:3000` sin abrir puertos
  entrantes. La app no publica puertos.
- Cloudflare entrega `X-Forwarded-Proto` y `CF-Connecting-IP`; la app usa
  `PROTOCOL_HEADER` y `ADDRESS_HEADER`.
- PostgreSQL nunca sale a Internet; `compose.dev.yaml` publica la base solo en
  `127.0.0.1`.
- El origen público se deriva de la petición en runtime; no se hornea en la
  imagen. `ORIGIN` solo se usa en build para prerender/pruebas.
- La app corre como usuario sin privilegios, con `cap_drop: ALL` y
  `no-new-privileges`.
- Los secretos viven en `.env` o en el gestor de secretos del despliegue.

## 10. Respaldos y mantenimiento

- Se respaldan juntos PostgreSQL y el volumen de fotos.
- El respaldo coordinado y la restauración se documentan en
  [`../guias/operacion.md`](../guias/operacion.md).
- La limpieza de staging, huérfanos y suscripciones push revocadas se ejecuta con
  `node scripts/cleanup.mjs`.
- No se ejecuta limpieza concurrente que borre archivos aún en uso.
- Un fallo de disco o base de datos se muestra como fallo visible; no se
  aprueban ni envían entregas parciales.
- Se registran fallos de conversión, limpieza, base de datos, tiempos de ZIP y
  errores push.

## 11. Operación sin sobreingeniería

- La carga principal son archivos, no un gran número de conexiones. Se
  optimizan miniaturas, paginación y streaming antes de añadir infraestructura.
- La bandeja interna es persistente y crítica; el push es best effort.
- No se usan WebSockets. La UI refresca contadores cada 30 s y al volver a la
  pestaña, y recarga la vista al enfocar salvo en fichas de captura.
- Las tareas de limpieza corren con un comando del contenedor o cron simple.
- Se actualizan dependencias, se revisan imágenes y se mantiene la base privada.
