# Modelo de datos y consistencia

> **Audiencia:** desarrollo y operación técnica.
> **Estado:** vigente. Contrastar con `src/lib/server/db/schema.ts` al cambiar el
> esquema.

Este documento describe el modelo relacional implementado con PostgreSQL y
Drizzle. Los nombres de tablas y campos son los reales; las reglas de
integridad, transacciones e invariantes son contrato funcional.

## 1. Convenciones

- IDs `uuid` para recursos expuestos en rutas. La dificultad de adivinar un ID
  nunca sustituye una comprobación de autorización.
- Fechas `timestamptz` en UTC. La zona horaria se aplica solo en presentación.
- Enums validados en SQL y en aplicación.
- Índices sobre claves foráneas y campos usados en búsquedas y listados.
- `created_by`, `updated_by`, `created_at` y `updated_at` donde corresponda.
- Los nombres visibles tienen **exactamente un origen**: vínculo a catálogo o
  `custom_name`, nunca ambos.
- Toda consulta de un recurso de servicio resuelve el ámbito por su cadena de
  claves foráneas, incluidas fotos, miniaturas, notificaciones y búsqueda.
- Los nombres históricos se conservan como snapshots; no se depende de la fila
  actual del usuario.

## 2. Relaciones principales

```text
users ──< sessions
  │
  ├──< contract_assignments >── contracts ──< services
  │                                  │            │
  ├──< service_assignments >─────────┘            ├──< works
  │                                               │      └──< elements
  │                                               │              │
  │                                               └──────────────┴──> evidence_targets
  │                                                                          │
  │                                      ┌───────────────────────────────────┼────────────────────┐
  │                                      ▼                                   ▼                    ▼
  │                                photo_requirements                    photos          evidence_submissions
  │                                      │                                   │                    │
  │                                      └───────────────────────────────────┴──< submission_photos └──< reviews
  │
  ├──< notifications
  ├──< push_subscriptions
  └──< audit_events

catalogs ──< catalog_items ──< catalog_item_relations >── catalog_items
                         └──(vínculos opcionales)── works / elements / services / photo_requirements
```

Un `evidence_target` se enlaza **o** con un trabajo directo **o** con un
elemento. No existen targets de ambos niveles para el mismo trabajo dividido.

`service_assignments` está subordinado a `contract_assignments`: una asignación
de servicio solo es efectiva si el usuario sigue siendo miembro activo del
contrato del servicio con el rol correspondiente.

## 3. Identidad y acceso

### `users`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | Identidad estable |
| `username` | text | Único case-insensitive mediante índice funcional |
| `display_name` | text | Nombre visible |
| `password_hash` | text | Argon2id; nunca se guarda la contraseña |
| `role` | enum | `admin`, `supervisor`, `technician` |
| `is_active` | boolean | Activo por defecto |
| `disabled_at` | timestamptz nullable | Fecha de desactivación |
| `created_at`, `updated_at` | timestamptz | Auditoría básica |

Debe existir siempre al menos un administrador activo después del primer
arranque. La comprobación se serializa para resistir solicitudes simultáneas.

### `sessions`

`id`, `token_hash`, `user_id`, `created_at`, `expires_at`, `revoked_at`,
`user_agent` e `ip` opcionales. La cookie es `HttpOnly`, `Secure` bajo HTTPS y
`SameSite=Lax` o más estricta. Cada petición valida el usuario activo y el rol
actual; no se confía en permisos cacheados en la cookie.

### `contracts`

`id`, `name` único, `description`, `pdf_background_path`,
`pdf_margin_top`, `pdf_margin_bottom`, `pdf_margin_left`, `pdf_margin_right`,
`created_by`, `created_at` y `updated_at`.

- Es el nivel superior y agrupa servicios.
- Un servicio pertenece siempre a un contrato (`services.contract_id NOT NULL`).
- No se elimina un contrato con servicios: la FK usa `RESTRICT`.
- Los márgenes se guardan en milímetros y el fondo es una ruta interna.

### `contract_assignments`

`id`, `contract_id`, `user_id`, `assignment_role` (`technician`/`supervisor`),
`assigned_by`, `assigned_at`, `revoked_at`.

- Define quién puede ser asignado a los servicios del contrato.
- Índice único parcial sobre `(contract_id, user_id, assignment_role)` con
  `revoked_at IS NULL`.
- Revocar una asignación de contrato revoca en cascada las asignaciones de
  servicio de ese usuario dentro del contrato.
- Un cambio de rol global que deje asignaciones incompatibles exige confirmación
  y las revoca.

### `services`

`id`, `contract_id` (FK `RESTRICT`), `name`, `description`,
`building_catalog_item_id` nullable, `building_name_snapshot`,
`created_by`, `created_at` y `updated_at`.

- Cambiar de contrato revoca las asignaciones de servicio incompatibles.
- El administrador que asigna un servicio incorpora al usuario al contrato si
  falta; el supervisor del contrato solo puede asignar a miembros existentes.
- El edificio puede ser un ítem de catálogo o un nombre conservado en snapshot.

### `service_assignments`

`id`, `service_id`, `user_id`, `assignment_role`, `assigned_by`, `assigned_at`,
`revoked_at`.

- Activa si `revoked_at IS NULL` y el usuario está activo.
- Índice único parcial sobre `(service_id, user_id, assignment_role)` con
  `revoked_at IS NULL`.
- Solo se asigna a miembros activos del contrato con el rol correspondiente.
- Se conserva el historial de altas y revocaciones.
- Los administradores no necesitan asignación.

## 4. Catálogos

### `catalogs`

`id`, `name`, `description`, `purpose`, `sort_order`, `created_at`,
`updated_at`.

`purpose` es un enum con tres valores:

- `general`: nombres de trabajos y elementos.
- `buildings`: edificios de servicio.
- `requirements`: requisitos fotográficos.

### `catalog_items`

`id`, `catalog_id` (FK `CASCADE`), `name`, `sort_order`, `created_at`,
`updated_at`.

- Índice único case-insensitive sobre `(catalog_id, lower(name))`.
- No se fuerza unicidad global entre catálogos.
- El nombre visible de una instancia es `COALESCE(catalog_item.name,
  custom_name)`.

### `catalog_item_relations`

`id`, `from_item_id`, `to_item_id`, `relation_type` nullable, `created_at`.

- FK `CASCADE` hacia ítems.
- CHECK contra relaciones de un ítem consigo mismo.
- Unicidad de `(from_item_id, to_item_id, relation_type)`.
- Índice único parcial para el par sin tipo (`relation_type IS NULL`), porque
  PostgreSQL considera distintos los `NULL`.
- La creación en lote omite pares ya existentes.
- El sentido es explícito; no se deduce una jerarquía universal.

### Eliminación y desvinculación

- `works.catalog_item_id`, `elements.catalog_item_id` y
  `photo_requirements.catalog_item_id` son FKs anulables.
- `services.building_catalog_item_id` es anulable y conserva
  `building_name_snapshot`.
- Borrar un ítem ejecuta una transacción que copia el último nombre a
  `custom_name` o al snapshot, anula la FK, elimina relaciones y borra el ítem.
- No hay `ON DELETE CASCADE` desde catálogos hacia evidencia.
- Renombrar una instancia concreta guarda `custom_name` y anula
  `catalog_item_id` atómicamente.

## 5. Trabajos y elementos

### `works`

`id`, `service_id` (FK `CASCADE`), `mode` (`direct`/`divided`),
`catalog_item_id` nullable, `custom_name` nullable, `description`, `sort_order`,
`created_at`, `updated_at`.

- CHECK de un solo origen de nombre.
- Para `direct`, debe existir un único `evidence_target` del trabajo y cero
  elementos.
- Para `divided`, no puede existir evidencia directa en el padre y puede haber N
  elementos.
- La coherencia entre modo, elementos y targets es cross-table; se protege con
  transacciones del dominio.
- Cambiar de modo exige bloquear el trabajo, comprobar que no existe ninguna
  entrega histórica y reasignar manualmente elementos, requisitos y fotos.

### `elements`

`id`, `work_id` (FK `CASCADE`), `catalog_item_id` nullable, `custom_name`
nullable, `description`, `sort_order`, `created_at`, `updated_at`.

- Solo pertenecen a trabajos `divided`.
- Cada elemento tiene exactamente un `evidence_target`.
- Dos elementos pueden compartir ítem de catálogo bajo trabajos distintos; son
  instancias diferentes.

## 6. Objetivos, requisitos y fotos vigentes

### `evidence_targets`

`id`, `work_id` nullable, `element_id` nullable, `current_status`, `version`,
`latest_submission_id` nullable, `created_at`, `updated_at`.

- CHECK XOR: exactamente uno de `work_id` o `element_id` es no nulo.
- Índices únicos para `work_id` y `element_id`.
- `version` empieza en 0 y es el token de concurrencia optimista.
- Estados: `pending`, `in_progress`, `in_review`, `rejected`, `approved`.
- La transición la controla el servidor; no se acepta un estado arbitrario desde
  un endpoint genérico.

### `photo_requirements`

`id`, `target_id` (FK `CASCADE`), `catalog_item_id` nullable, `custom_name`
nullable, `is_required` (default `true`), `sort_order`, `created_at`,
`updated_at`.

- Nombre con origen XOR: ítem de catálogo `requirements` o nombre propio.
- Renombrar el requisito a mano lo desvincula.
- Borrar el ítem de catálogo copia el último nombre y desvincula.
- Los requisitos son por target, no una plantilla global mutable.
- La creación de trabajos, la generación en lote y el alta de elementos insertan
  requisitos en el objetivo directo o en cada elemento, omitiendo duplicados por
  nombre.
- «Nunca se envió» equivale a `NOT EXISTS (SELECT 1 FROM evidence_submissions
  WHERE target_id = ...)`, no a mirar solo el estado actual.
- Después del primer envío se bloquean las mutaciones, incluso si la última
  entrega fue rechazada.
- Adicionales se representa con `requirement_id NULL`; no es una fila.
- Borrar un requisito antes del primer envío pasa sus fotos a Adicionales,
  preserva autoría y orden, resuelve conflictos de posición, incrementa la
  versión y borra el requisito, todo atómico.

### `photos`

| Campo | Función |
|---|---|
| `id` PK | Identidad estable |
| `target_id` FK | Objetivo de la evidencia |
| `requirement_id` nullable | Sección vigente; `NULL` = Adicionales |
| `sort_order` | Orden dentro del grupo |
| `storage_path`, `thumbnail_path` | Rutas internas generadas por servidor |
| `mime_type`, `size_bytes`, `width`, `height`, `checksum` | Metadatos validados |
| `processing_status` | `processing`/`ready`/`failed`; solo `ready` se envía |
| `uploaded_by`, `uploaded_by_name`, `uploaded_at` | Autoría de carga |
| `removed_by`, `removed_by_name`, `removed_at` | Retiro del borrador vigente |

- Evidencia vigente: `removed_at IS NULL` y archivo `ready`.
- Retirar una foto no hace hard delete si aparece en `submission_photos`.
- Una foto no referenciada puede limpiarse tras un periodo seguro, conservando
  auditoría de retiro.
- El contenido binario de una foto `ready` es inmutable.
- Se valida que foto y requisito pertenecen al mismo target.
- No se cambia de grupo por API ordinaria. Las únicas reasignaciones permitidas
  son el asistente de conversión previa a envíos y el traslado automático por
  eliminación de requisito previa a envíos.
- La subida usa staging, escritura atómica y reparación de huérfanos.

## 7. Entregas y revisiones

### `evidence_submissions`

`id`, `target_id` (FK `CASCADE`), `sequence_no`, `submitted_by`,
`submitted_by_name`, `submitted_at`, `evidence_version`,
`target_name_snapshot`, `work_name_snapshot`, `service_name_snapshot`.

- `UNIQUE(target_id, sequence_no)`; la secuencia se asigna serializando por
  target.
- No se actualiza ni borra una entrega desde flujos ordinarios. El DELETE solo
  ocurre en un borrado administrativo destructivo.
- Los snapshots de nombre conservan el contexto aunque el recurso se renombre.
- Las fotos se guardan como filas individuales, no como una matriz JSON.

### `submission_photos`

`id`, `submission_id` (FK `CASCADE`), `photo_id` (FK `RESTRICT`),
`group_kind` (`requirement`/`additional`), `requirement_name_snapshot`,
`group_sort_order`, `photo_sort_order`, `photo_uploaded_by_snapshot`,
`photo_uploaded_by_name`, `photo_uploaded_at_snapshot`.

- Registra foto, sección y orden originales.
- `UNIQUE(submission_id, photo_id)`; la misma foto puede aparecer en entregas
  distintas del mismo objetivo.
- `photo_id` con `RESTRICT` impide borrar una foto usada en una entrega.
- El historial se basa exclusivamente en `submission_photos`, nunca en
  `photos.removed_at` ni en posiciones vigentes.

### `reviews`

`id`, `submission_id` único, `reviewer_id`, `reviewer_name`, `decision`
(`approved`/`rejected`), `reason` nullable, `reviewed_at`.

- CHECK: rechazo exige `reason` no nulo y no vacío tras `trim`; aprobación puede
  no tener motivo.
- Máximo una revisión por entrega.
- No se edita ni sustituye.
- El cambio de estado del target ocurre en la misma transacción.
- Un rechazo habilita una nueva entrega sin borrar la anterior.

## 8. Notificaciones y auditoría

### `notifications`

`id`, `recipient_user_id`, `service_id`, `target_id`, `submission_id`,
`review_id`, `event_type`, `title`, `body`, `deep_link`, `created_at`,
`read_at`, `event_key`.

- `UNIQUE(recipient_user_id, event_key)` evita duplicados por reintentos.
- Las notificaciones se crean dentro de la transacción del envío o revisión.
- El push se envía después del commit.
- Al borrar un servicio u objetivo se eliminan o invalidan las notificaciones
  vinculadas para no dejar enlaces rotos.

### `push_subscriptions`

`id`, `user_id`, `endpoint` único, `p256dh`, `auth`, `user_agent`,
`created_at`, `last_success_at`, `revoked_at`.

- Endpoint y claves se tratan como secretos operativos.
- Se eliminan suscripciones inválidas o expiradas.
- La clave privada VAPID vive solo en el entorno.

### `audit_events`

`id`, `actor_user_id`, `actor_name`, `service_id`, `entity_type`, `entity_id`,
`action`, `metadata_json`, `created_at`.

- Registra cambios críticos: roles, asignaciones, modos, borrados, subidas,
  retiradas, envíos y revisiones.
- `metadata_json` no contiene secretos.
- La auditoría no sustituye los snapshots históricos.

## 9. Algoritmos transaccionales

### Subida

1. Validar acceso y estado editable.
2. Aceptar el archivo en staging seguro; validar MIME real, tamaño y dimensiones;
   procesar y confirmar.
3. Bloquear el target o usar operación atómica; revalidar acceso y estado.
4. Insertar la foto, asignar posición, incrementar versión y pasar de `pending`
   a `in_progress` cuando corresponda. `rejected` se conserva.
5. Si algo falla, limpiar el archivo temporal sin dañar snapshots.

### Quitar y ordenar

1. Validar `expected_version` y estado editable.
2. Aplicar compare-and-swap sobre `evidence_targets.version` o bloqueo
   equivalente.
3. Quitar marca `removed_at` y actor; ordenar valida el conjunto exacto del
   grupo y actualiza posiciones sin duplicados.
4. Incrementar versión una sola vez. Si la versión no coincide, `409`.

### Enviar

1. Abrir transacción y bloquear el target.
2. Verificar acceso, estado, versión y ausencia de fotos `processing`.
3. Validar cada requisito obligatorio y, si no hay obligatorios, al menos una
   foto total.
4. Calcular la siguiente secuencia e insertar la entrega con autor, fecha y
   versión.
5. Insertar `submission_photos` con grupo, nombre y posición congelados.
6. Actualizar estado a `in_review`, `latest_submission_id` y versión.
7. Crear notificaciones internas idempotentes.
8. Commit y, después, intentar Web Push.

### Revisar

1. Abrir transacción, bloquear target y comprobar que la entrega es la última y
   está en `in_review`.
2. Verificar supervisor asignado o administrador, usuario activo y motivo si
   rechaza.
3. Insertar la revisión única.
4. Actualizar estado a `approved` o `rejected`, incrementar versión y crear
   notificaciones.
5. Commit y Web Push best effort. Una revisión concurrente incompatible recibe
   `409`.

### Borrar catálogo o ámbito

- **Ítem de catálogo:** transacción de desvinculación preservadora; nunca
  cascada hacia evidencia.
- **Servicio, trabajo o elemento:** mostrar impacto, confirmar y borrar el
  ámbito. Los archivos físicos se eliminan después del commit mediante una lista
  segura o recolector.
- Un borrado parcial conserva los demás elementos y sus snapshots.

## 10. Agregados

```text
approved(target) = target.current_status == 'approved'

approved(work):
  si work.mode == 'direct':
    approved(target_directo)
  si work.mode == 'divided':
    count(elements) > 0 AND para_cada(element, approved(target_elemento))

completed(service):
  count(works) > 0 AND para_cada(work, approved(work))
```

El porcentaje puede calcularse como objetivos aprobados / objetivos totales,
indicando por separado los trabajos divididos vacíos para no reportar un 100 %
falso. El porcentaje es informativo; el criterio de completado es el predicado
anterior.

## 11. Índices y constraints recomendados

- `users`: unique sobre `lower(username)`.
- `sessions`: `(user_id, expires_at)` y unique sobre `token_hash`.
- `contract_assignments`: unique parcial activo y `(user_id, revoked_at)`.
- `service_assignments`: unique parcial activo y `(user_id, revoked_at)`.
- `works(service_id, sort_order)` y `elements(work_id, sort_order)`.
- `works(catalog_item_id)`, `elements(catalog_item_id)`,
  `services(building_catalog_item_id)`.
- `catalog_items(catalog_id, lower(name))`.
- `catalog_item_relations(from_item_id, to_item_id, relation_type)` y parcial
  para tipo nulo.
- `evidence_targets(work_id)` y `(element_id)` únicos.
- `photo_requirements(target_id, sort_order)`.
- `photos(target_id, removed_at, requirement_id, sort_order)`.
- `evidence_submissions(target_id, sequence_no)` único.
- `submission_photos(submission_id, group_sort_order, photo_sort_order)`.
- `reviews(submission_id)` único.
- `notifications(recipient_user_id, read_at, created_at)` y
  `(recipient_user_id, event_key)` único.
- `pg_trgm` es opcional si las búsquedas con `ILIKE` se vuelven lentas; en
  decenas de usuarios no se exige motor externo.

## 12. Integridad y seguridad de datos

- Transacciones del ORM y validación server-side; FKs y constraints como defensa
  en profundidad.
- No se modifican entregas ni revisiones en operación normal.
- Se protegen importaciones y exportaciones contra traversal, ZIP Slip,
  inyección de fórmulas y agotamiento de recursos.
- El respaldo incluye **base de datos y directorio de fotos** de forma
  coordinada.
- Las migraciones conservan datos históricos; no se resetea producción.
- Las pruebas de borrado y limpieza usan snapshots referenciados reales para no
  violar `RESTRICT` por accidente.
