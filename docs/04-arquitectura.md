# 04 — Arquitectura, seguridad y despliegue

## 1. Arquitectura de referencia

Una **sola aplicación SvelteKit** entrega frontend, endpoints, sesiones, lógica de negocio y acceso a PostgreSQL y al volumen de archivos. PostgreSQL administra la información relacional; el sistema de archivos guarda fotografías y miniaturas optimizadas. No separar el proyecto en microservicios en v1.

```text
[ Navegador / PWA instalada ]
         │ HTTPS
         ▼
[ Reverse proxy / TLS existente ]
         │
         ▼
[ SvelteKit (Node, adapter-node) ]
   ├── UI SSR + navegación cliente
   ├── acciones/endpoints autenticados
   ├── servicios de dominio y transacciones
   ├── procesamiento fotos / ZIP
   ├── worker SW/VAPID para clientes
   ├── Drizzle ──────────────────────────────► [ PostgreSQL ]
   └── archivos ─────────────────────────────► [ Volumen local de fotos ]
                 └── envío Web Push externo estándar
```

El navegador necesita conectividad: **sin cola offline ni sincronización de trabajos** en v1. Puede cachear recursos estáticos para instalar la PWA sin representar capacidad de operar desconectado.

## 2. Estructura orientativa de proyecto

```text
lumen/
├── src/
│   ├── lib/
│   │   ├── components/             # componentes compartidos y shadcn-svelte
│   │   ├── server/
│   │   │   ├── auth/               # sesiones, hashes y permisos
│   │   │   ├── db/                 # conexión, schema y queries Drizzle
│   │   │   ├── domain/             # reglas de servicio, evidencia, revisión
│   │   │   ├── storage/            # guardado, thumb, limpieza, ZIP
│   │   │   ├── notifications/      # inbox, web push, suscripciones
│   │   │   └── exports/            # ZIP de contrato/servicio/trabajo/entrega
│   │   └── schemas/               # validaciones compartidas, sin secretos
│   ├── routes/
│   │   ├── (auth)/login/
│   │   ├── (setup)/setup/
│   │   ├── (app)/dashboard/
│   │   ├── (app)/search/
│   │   ├── (app)/services/[serviceId]/
│   │   ├── (app)/works/[workId]/
│   │   ├── (app)/elements/[elementId]/
│   │   ├── (app)/notifications/
│   │   ├── (app)/admin/{users,catalogs,services}/
│   │   └── api/                    # imágenes, descargas, foto, push
│   ├── hooks.server.ts
│   └── service-worker.*            # configuración real según integración PWA
├── drizzle/                       # migraciones versionadas
├── tests/                         # unitarias, integración y E2E
├── static/                         # iconos y recursos públicos, NUNCA fotos
├── Dockerfile
├── compose.yaml
├── .env.example
└── ...
```

Esta distribución es ilustrativa; usar convenciones reales de SvelteKit, evitar introducir un segundo servidor HTTP innecesario y separar con claridad archivos `server` para que nada privado vaya al bundle cliente.

## 3. Stack y compatibilidad

- **Svelte 5** con runes y componentes compatibles; **SvelteKit** en versión estable compatible.
- **TypeScript** estricto para endpoints, servicios y UI; no inferir autorizaciones por tipos de cliente.
- **Tailwind CSS** y **shadcn-svelte** para componentes base (diálogos, menús, pestañas, formularios, tablas); personalizar sin perder accesibilidad.
- **Drizzle ORM** para transacciones y SQL tipado; **Drizzle Kit** para migraciones registradas.
- **PostgreSQL** con `timestamptz`, FKs, índices y transacciones; seleccionar versión estable soportada y fijarla en Compose.
- **Node.js** con `@sveltejs/adapter-node`; Dockerfile multi-stage, imagen mínima y usuario sin privilegios.
- **PWA:** usar integración mantenida para SvelteKit, preferentemente `@vite-pwa/sveltekit` si sigue siendo compatible con las versiones instaladas. Verificar generación de manifest/service worker y ciclo de activación antes de fijar dependencia.
- **Fotografías:** biblioteca de procesado estable en Node (p. ej. Sharp/libvips). Validar HEIC de acuerdo con soporte efectivo compilado; no anunciar compatibilidad si no existe.
- **Web Push:** implementación Web Push estándar con VAPID en servidor y `PushManager`/service worker en navegador, sin Firebase requerido.

Evitar bloquear implementación en números de versión supuestos. Usar lockfile reproducible e inventario de dependencias.

## 4. Módulos internos del backend

### Autenticación y autorización

`getSessionUser(request)` debe devolver usuario activo real desde sesión; `requireAdmin()`, `requireContractAccess(contractId)`, `requireContractManage(contractId)`, `requireServiceAccess(serviceId)`, `requireCapture(targetId)` y `requireReview(submissionId)` actúan **antes** de recuperar/transferir datos sensibles.

- Admin: todas las operaciones autorizadas por rol.
- Técnico: `capture`/`submit` y consulta/descargas sobre servicio asignado **y siendo miembro de su contrato**.
- Supervisor: `review` y consulta/descargas sobre servicio asignado (miembro de su contrato); nunca captura. Además, dentro de sus contratos, **gestiona asignaciones de servicio**.
- Usuario desactivado: sin acceso aun con cookie no expirada.
- Comprobar alcance en búsqueda, endpoints de imágenes/miniaturas, ZIP, historial, push deep links y mutation actions.

### Ámbito por contrato

La jerarquía es **contrato → servicio → trabajo/elemento**. El contrato agrupa servicios y define a sus participantes:

- `getContractAccess` / `visibleContractIds` resuelven la pertenencia (admin global; si no, `contract_assignments` activas) y devuelven `404` opaco fuera de ámbito.
- La visibilidad de un servicio exige **asignación de servicio activa** *y* **pertenencia activa al contrato** con el mismo rol (`listAllowedServiceIds`), lo que retira el acceso al salir del contrato aunque la asignación siguiera marcada.
- Asignar un servicio valida la pertenencia al contrato: el admin incorpora al usuario si falta; un supervisor del contrato solo puede usar miembros existentes.
- Revocar una asignación de contrato revoca en cascada las de servicio dentro del contrato.

### Servicios y catálogos

Un servicio de dominio central orquesta cambios estructurales y las invariantes del documento 01; no repetir lógica de reglas en cinco endpoints. Interfaces recomendadas: `createService`, `assignUser`, `createWork`, `createElementsBulk`, `convertWorkMode`, `detachCatalogItem`, `deleteWorkWithImpact`.

### Evidencia

Funciones servidor como `appendPhoto`, `removePhoto`, `reorderPhotos`, `validateRequirements`, `submitEvidence`, `reviewSubmission`, `getHistory`; todas resuelven `target` canónico para que directo/dividido compartan lógica. Nunca permitir entrada de `current_status='approved'` por endpoint genérico.

### Exportaciones

`buildExportPlan(scope)` (rutas + agregados), `exportSubmissionZip(submissionId)`, `exportWorkZip(workId)`, `exportServiceZip(serviceId)`, `exportContractZip(contractId)` y `buildWorkbook(plan)` (XLSX) y `buildWorkPdf` (PDF por trabajo). Accesibles a **administradores y supervisores** (el de contrato, solo a supervisores del contrato); los **técnicos no exportan** ZIP. Paths de ZIP provenientes de IDs y nombres saneados, con desambiguación para repetidos.

## 5. Endpoints y acciones orientativas

La ruta exacta se puede ajustar a SvelteKit. **No usar CRUD público genérico** para entidades inmutables o estados críticos.

| Método / acción | Recurso lógico | Quién | Precondición |
|---|---|---|---|
| POST | `/login` | Público | Credenciales correctas, cuenta activa |
| POST | `/setup` | Primer arranque | Aún no hay admin; transacción serializada |
| POST | `/admin/services` | Admin | Datos válidos |
| POST | `/admin/works/:id/convert` | Admin | Sin entregas históricas; mapa completo; versión |
| POST | `/api/targets/:id/photos` | Técnico/admin | Acceso, estado editable, archivo válido |
| DELETE | `/api/targets/:id/photos/:photoId` | Técnico/admin | Acceso, estado editable, versión vigente |
| PUT | `/api/targets/:id/photo-order` | Técnico/admin | Acceso, grupo consistente, versión vigente |
| POST | `/api/targets/:id/submit` | Técnico/admin | Requisitos válidos, versión vigente |
| POST | `/api/submissions/:id/review` | Supervisor asignado/admin | Entrega en revisión, razón si rechazo |
| GET | `/api/photos/:id/content` | Ámbito de servicio | No servir path de filesystem sin autorización |
| GET | `/api/photos/:id/thumbnail` | Ámbito de servicio | Igual autorización que foto |
| GET | `/api/submissions/:id/export.zip` | Ámbito de servicio | Foto snapshot histórica |
| GET | `/api/services/:id/export.zip` | Ámbito de servicio | Últimas aprobadas + resumen |
| GET | `/api/contracts/:id/export.zip` | Admin o supervisor del contrato | Fotos aprobadas + registro XLSX + PDF (`?variant=simple\|extended&xlsx=0\|1&photos=0\|1&pdf=0\|1`) |
| GET | `/api/contracts/:id/pdf-background` | Miembros del contrato | Fondo del PDF (PNG) del contrato |
| GET | `/api/works/:id/export.zip` | Admin o supervisor asignado | Ídem, jerarquía por trabajo (mismas opciones) |
| GET | `/api/services/:id/export.zip` | Admin o supervisor asignado | Ídem, jerarquía por servicio (mismas opciones) |
| GET | `/api/search?q=...` | Sesión activa | Resultados filtrados por acceso |
| POST | `/api/push/subscriptions` | Sesión activa | Endpoint validado |

Preferir acciones server de SvelteKit para formularios normales y rutas HTTP específicas para cargas, thumbnails y streaming. Se recomienda devolver errores coherentes: `400` validación, `401` sesión ausente, `403`/`404` recurso ajeno (evitar enumeración), `409` conflicto de versión/estado, `413` archivo excesivo, `415` formato inválido, `500` fallos internos sin secretos.

## 6. Carga, transformación y ciclo de vida de fotografías

### Pipeline seguro

1. Cliente adjunta JPEG/PNG/WebP, HEIC **solo si soportado**; opcional `capture="environment"` cuando navegador lo acepte.
2. Backend valida autorización, límites por archivo y tipo **detectado por contenido**, no solo extensión/MIME declarado; limitar dimensiones y consumo de memoria para evitar bombas de descompresión.
3. Guardar en **staging no público** con nombre aleatorio y cuota/duración limitada.
4. Normalizar orientación, eliminar EXIF sensible (incluido GPS), convertir/optimizar a formato persistente compatible (p. ej. JPEG/WebP), máximo sugerido de lado mayor 2560 px, generar miniatura ~400 px. Valores configurables: equilibrar evidencia útil y almacenamiento.
5. Al completar ambos archivos, mover atómicamente a almacenamiento final y registrar `photos.processing_status='ready'` con metadatos. Operaciones idempotentes y limpieza ante fallos.
6. Notificar a cliente progreso/resultado. Solo `ready` puede entrar al snapshot de entrega.

### Rutas de disco

Ejemplo interno **no accesible desde HTTP directo**:

```text
/data/photos/
├── objects/
│   └── ab/cd/<photo-uuid>.jpg
├── thumbnails/
│   └── ab/cd/<photo-uuid>.webp
├── staging/
└── export-temp/
```

- Usar IDs generados, no nombres enviados ni rutas proporcionadas por clientes.
- Volumen persistente de Docker montado de forma explícita; usuario del contenedor con permisos mínimos.
- Fotos de snapshots históricos son **inmutables en contenido**. Retirarlas de evidencia vigente marca `removed_at`, pero no se elimina binario si alguna `submission_photos` la referencia.
- Un job simple dentro de app (o comando de mantenimiento) puede recolectar archivos no referenciados y temporales expirados tras comprobar FKs. No exige Redis ni cron externo, aunque puede añadirse cron de despliegue.
- Eliminación destructiva de servicio/trabajo/elemento puede liberar archivos ya sin referencias **después del commit**. Nunca borrar foto antes de finalizar transacción SQL.

### Límites y cuotas

Valores **sugeridos, configurables** para v1: tamaño máximo de subida por archivo (p. ej. 20–25 MiB), límite de concurrencia de procesado, límite razonable de dimensiones y tasa por usuario. No limitar **cantidad** de fotografías por grupo/objetivo por regla de negocio. Gestionar errores de disco lleno y archivos incompatibles con mensajes accionables.

## 7. Almacenamiento y ZIP

- **Fotos**: servir mediante `GET` autenticado con `Content-Type` seguro, `Cache-Control` apropiado para recursos privados y `Content-Disposition` en descargas; no crear URLs públicas permanentes.
- **ZIP entrega**: recorrer `submission_photos` ordenadas (grupo y posición), copiar binarios, carpetas con nombre congelado; fotos numeradas `01`, `02`... sin depender de nombres originales.
- **ZIP servicio**: recorrer todos los objetivos (trabajo directo o elementos), seleccionar solo última entrega **aprobada**; incluir `resumen.csv` con todas las unidades incluyendo omitidas. Mantener contextos de carpetas trabajo/elemento y tratar nombres repetidos añadiendo identificadores cortos seguros.
- **Streaming**: preferir salida ZIP bajo demanda y conexión de lectura controlada; alternativa temporal en volumen con cuotas/expiración. Si el cliente corta conexión, cerrar streams/limpiar temporales. Evitar generar ZIP entero en RAM.
- **Registro XLSX**: cada ZIP puede incluir `<Ámbito>/<Ámbito>.xlsx` en la variante **Simple** o **Extendida** (`?variant=`), una fila por trabajo, generado con **`exceljs`** (MIT) y añadido al ZIP como entrada binaria. Los hipervínculos son **relativos** al libro y apuntan al PDF de evidencia de cada trabajo; Excel/LibreOffice los resuelven, Google Sheets no. Si algún día se admiten datos de usuario, neutralizar celdas que comiencen `=`, `+`, `-`, `@` o caracteres de control.
- **PDF por trabajo**: generado con **`pdf-lib`** (MIT), sin portada, con cabecera corrida, hasta 4 fotos por página (2×2) y pie `fecha · autor`; bloques por elemento/requisito. El **fondo del contrato** (`backgrounds/<contrato>.png`, normalizado con `sharp`, máx. 5 MB) se dibuja en todas las páginas con un panel claro semitransparente. Con fotografías el PDF va en la carpeta del trabajo; sin ellas, directamente en la del servicio.
- **Archivos históricos**: las rutas del ZIP se derivan de los nombres de grupo guardados **en cada entrega**, no de requisitos actuales.

## 8. Seguridad de aplicación

- Contraseñas con **Argon2id** (o algoritmo moderno equivalente), sal aleatoria y política mínima razonable; throttling/rate limiting para login y uploads.
- Sesiones de servidor y cookies `HttpOnly`, `Secure` en HTTPS, `SameSite`, expiración y revocación. Protección contra CSRF y verificación de `Origin` en mutaciones; no usar auth en localStorage.
- Autorización a nivel **servicio** centralizada y aplicada incluso a lectura de miniatura e historial. Evitar que búsqueda revele nombres ajenos.
- Validación estricta de inputs de cliente (esquemas, IDs, longitudes, tipo/orden y relaciones). Nunca aceptar `uploaded_by`, `reviewer_id` o `approved=true` del cuerpo como autoridad.
- CSP razonable, escaping de contenido HTML, protección frente a XSS, cookies, encabezados de seguridad y reverse proxy confiable.
- Normalizar/sanear filenames exportados; evitar traversal, path injection, lectura arbitraria de archivos y colisiones de ZIP.
- Roles protegidos al degradar último admin; primer arranque protegido contra carrera.
- Logs sin credenciales, tokens, contraseñas, claves privadas VAPID ni contenido sensible innecesario.
- Autorización se revalida al **descargar** aun si el contenido estaba precalculado.

## 9. PWA y Web Push

### PWA

- Manifest instalable con nombre `Lumen`, `short_name`, iconos adecuados y modo `standalone`.
- Service worker cachea recursos **estáticos** versionados; no cachea indiscriminadamente fotos privadas, respuestas autenticadas o formularios editables.
- Mostrar indicación de **sin conexión**; las acciones que requieren servidor están deshabilitadas o devuelven error claro. No simular envíos pendientes offline.
- Diseñar uso de cámara/galería y carga múltiple con rendimiento móvil.

### Web Push

1. Servidor genera par de claves **VAPID** en proceso de despliegue/configuración; clave pública se entrega a navegador, privada solo servidor.
2. Usuario da permiso explícito. Se registra `PushSubscription` por dispositivo/instalación en DB contra cuenta autenticada.
3. En evento de entrega/revisión, insertar notificaciones de bandeja dentro de la transacción.
4. Tras commit, mandar Web Push a las suscripciones de los destinatarios activos autorizados. Borrar suscripciones expiradas/inválidas (`404`/`410` del proveedor).
5. Service worker muestra notificación con texto y `data.url` seguro; clic abre Lumen en ruta relativa y el servidor **revalida permisos**.

**Limitaciones honestas:** Web Push depende de la infraestructura push del navegador/sistema; no funciona sin conexión de red, ni está garantizado en todos los navegadores. En iOS, típicamente requiere añadir la PWA a la pantalla de inicio y otorgar permiso desde esa instalación compatible. La bandeja interna funciona sin permiso push. No agregar Firebase como dependencia obligatoria.

## 10. Docker Compose y entornos

### Contenedores y volúmenes

```text
compose.yaml
  app: SvelteKit/Node, puerto interno configurable, healthcheck,
       volumen /data/photos (lectura/escritura)
       variables DATABASE_URL, ORIGIN, ...
  db: PostgreSQL con volumen /var/lib/postgresql/data,
      healthcheck y red privada

volumes:
  postgres_data: persistente
  lumen_photos: persistente
```

- Publicar puerto de app al proxy existente según instalación; no publicar Postgres a Internet por defecto.
- HTTPS en proxy inverso con `X-Forwarded-*` confiables según configuración y `ORIGIN` correcto. Guardar archivos fuera del root público.
- Base de datos debe inicializarse antes de marcar app lista; migrations controladas, con políticas claras sobre ejecución al arrancar (preferible comando específico con protección ante despliegues concurrentes).
- La app no debe contener ni exigir secretos de ejemplo en imágenes. Ejecutar proceso como usuario sin privilegios, healthchecks y señales de apagado limpias.
- GHCR es distribución preferida de imagen versionada; Compose puede permitir `image: ghcr.io/...:<version>` o build local.

### Variables de entorno previstas

| Variable | Finalidad |
|---|---|
| `DATABASE_URL` | URL interna PostgreSQL con credenciales protegidas |
| `ORIGIN` | URL pública HTTPS de Lumen para SvelteKit/cookies/redirecciones |
| `PHOTO_STORAGE_PATH` | Ruta montada de archivos persistentes |
| `MAX_UPLOAD_BYTES` | Tamaño máximo permitido por archivo |
| `IMAGE_MAX_DIMENSION` | Dimensión de normalización |
| `IMAGE_THUMB_DIMENSION` | Dimensión de miniatura |
| `VAPID_PUBLIC_KEY` | Clave pública para registrar PushSubscription |
| `VAPID_PRIVATE_KEY` | **Secreta**: firma de push |
| `VAPID_SUBJECT` | Identificador de contacto/operador para VAPID |
| `TZ` | Zona de presentación/operación de contenedor (persistir UTC) |

Se debe proveer `.env.example` **sin secretos reales** y validar entorno al arrancar. Si Push no está configurado, la aplicación y la bandeja interna siguen operables, con UX que indica «push no configurado» a administración.

## 11. Copias de seguridad, restauración y mantenimiento

**Imprescindible respaldar juntos:** volumen PostgreSQL y volumen de fotos (más configuración/secrets necesarios para despliegue, resguardados fuera de backups compartidos).

- Para pequeña instalación, programar backup consistente `pg_dump` **y** copia de fotos coordinada (p. ej. ventana sin escrituras, snapshot de volumen coherente o enfoque de puntos de recuperación/archivos inmutables). Documentar que dos copias tomadas en momentos arbitrarios pueden no coincidir.
- Incluir retención y verificación periódica de restauración en un entorno separado.
- En recuperación, restaurar ambos recursos y migrar con cuidado; verificar recuento de fotos y rutas referenciadas.
- Registrar consumo de disco, fallos de conversión, limpieza de temporales, BD, tiempos de descarga ZIP y errores push.
- Tratar caídas de disco o BD como fallos visibles, sin aprobar/enviar entregas parciales.

## 12. Operación fiable sin sobreingeniería

- Equipo pequeño: la carga principal son archivos, no gran número de conexiones. Optimizar miniaturas, paginación y streaming antes de introducir infraestructura.
- Notificaciones internas son persistentes y críticas; push es **best effort**. Un pequeño registro SQL de eventos de push por enviar permite reintentos si se necesita, sin Redis.
- No usar WebSockets para colaboración v1. Revalidar versión al mutar y ofrecer actualización manual/refresco periódico liviano opcional.
- Tareas de limpieza de staging/huérfanos pueden ejecutarse con comando del contenedor/cron simple. No ejecutar cleanup concurrente que borre archivos aún en uso.
- Incluir medidas de seguridad de despliegue razonables: actualización de dependencias, comprobación de imágenes, mínimos privilegios y acceso privado a la base de datos.
