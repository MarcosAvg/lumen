# 03 — Modelo de datos y consistencia

Este documento define el **modelo lógico recomendado** para PostgreSQL + Drizzle. Los nombres de tablas/campos son orientativos pero las claves, relaciones, transacciones e invariantes **sí son contrato funcional**. Implementar migraciones versionadas con Drizzle Kit; no sincronizar el esquema de producción con un `push` destructivo improvisado.

## 1. Convenciones

- IDs internos `uuid` o `bigint` consistente; se recomienda UUID para recursos expuestos en rutas. Nunca inferir autorizaciones a partir de que un ID sea difícil de adivinar.
- Fechas `timestamptz` en UTC (`created_at`, `updated_at`, etc.); formato local solo en presentación.
- Valores enumerados validados en SQL y aplicación; índices sobre FK y campos usados en consultas.
- Columnas `created_by`/`updated_by` en mutaciones administrativas donde corresponda; si un usuario se desactiva, la FK histórica se conserva.
- Nombres personalizados y referencias a ítems de catálogo se diseñan para permitir **exactamente un origen de nombre**.
- Todas las tablas relativas a un servicio se autorizan resolviendo servicio a través de su cadena de FK, incluso en consultas de archivos, notificaciones y búsqueda.

## 2. Vista de relaciones

```text
users ──< sessions
  │
  ├──< contract_assignments >── contracts ──< services >── catalog_items (edificio opcional)
  │                                  │            │
  ├──< service_assignments >─────────┘            └──< works ────────────────┐
  │                                                      └──< elements       │
  │                                                              │          │
  │                                                              └──────────┴──> evidence_targets
  │                                                                                 │
  │                                        ┌────────────────────────────────────────┼───────────────────────┐
  │                                        ▼                                        ▼                       ▼
  │                                  photo_requirements                          photos            evidence_submissions
  │                                        │                                        │                       │
  │                                        └────────────────────────────────────────┴──< submission_photos   └──< reviews
  │
  ├──< notifications
  ├──< push_subscriptions
  └──< audit_events

catalogs ──< catalog_items ──< catalog_item_relations >── catalog_items
                         └──(vínculos opcionales)── works / elements
```

**Nota:** un `evidence_target` se enlaza **o** con un trabajo directo **o** con un elemento; no se crean targets de ambos niveles para el mismo trabajo dividido.

**Nota de ámbito:** `service_assignments` (quién captura/revisa un servicio) está subordinado a `contract_assignments` (quién puede ser asignado): una asignación de servicio solo es efectiva si el usuario sigue siendo **miembro activo del contrato del servicio** con el mismo rol.

## 3. Identidad y acceso

### `users`

| Campo | Tipo orientativo | Regla |
|---|---|---|
| `id` | uuid PK | Identidad estable |
| `username` | text unique not null | Identificador normalizado; case-insensitive |
| `display_name` | text not null | Nombre visible |
| `password_hash` | text not null | Argon2id (o hash resistente recomendado); nunca guardar contraseña |
| `role` | enum | `admin`, `supervisor`, `technician` |
| `is_active` | boolean | `true` por defecto |
| `created_at`, `updated_at` | timestamptz | Auditoría básica |
| `disabled_at` | timestamptz nullable | Control operacional |

Restricción lógica transaccional: **siempre ≥1 admin activo** una vez terminado primer arranque. La protección debe funcionar contra solicitudes simultáneas; serializar modificaciones de admins o usar bloqueo/advisory lock pertinente.

### `sessions`

`id` (o hash del token), `user_id`, `created_at`, `expires_at`, `revoked_at`, metadatos mínimos opcionales. Cookies `HttpOnly`, `Secure` bajo HTTPS, `SameSite=Lax` o más estricto, expiración, rotación al iniciar sesión y protección CSRF/origen según método. Cada petición valida **`users.is_active` y rol actual**, no confiar en permisos cacheados en la cookie.

### `contracts`

`id`, `name` (único), `description`, `created_by`, `created_at`, `updated_at`.

- Nivel jerárquico superior: agrupa servicios. Un servicio pertenece **siempre** a un contrato (`services.contract_id NOT NULL`).
- Solo el administrador crea/edita/elimina contratos. **No se elimina un contrato con servicios** (409): primero se mueven o eliminan.

### `contract_assignments`

`id`, `contract_id`, `user_id`, `assignment_role` (`technician`/`supervisor`), `assigned_by`, `assigned_at`, `revoked_at` nullable.

- Define **quién puede ser asignado** a los servicios del contrato y **quién gestiona** sus asignaciones (supervisores del contrato).
- Índice único parcial sobre `(contract_id, user_id, assignment_role)` con `revoked_at IS NULL`.
- Al **revocar** una asignación de contrato se **revocan en cascada** las asignaciones de servicio de ese usuario dentro del contrato (deja de ver sus servicios), registrando el impacto en auditoría.
- Un cambio de rol global que deje asignaciones de contrato incompatibles exige confirmación y las revoca.

### `services` (nivel de contrato)

`contract_id` (FK a `contracts`, `ON DELETE RESTRICT`), `name`, `description`, `building_catalog_item_id`, `building_name_snapshot`, auditoría.

- **Cambiar de contrato** un servicio revoca las asignaciones de servicio cuyos usuarios no pertenezcan al nuevo contrato.
- El administrador que asigna un servicio **incorpora al usuario al contrato** si no lo estaba; un supervisor del contrato solo puede asignar a miembros existentes.

### `service_assignments`

`id`, `service_id`, `user_id`, `assignment_role` (`technician`/`supervisor`), `assigned_by`, `assigned_at`, `revoked_at` nullable.

- La asignación está activa cuando `revoked_at IS NULL` y `user.is_active`.
- Índice único parcial sobre `(service_id, user_id, assignment_role)` con `revoked_at IS NULL` para prevenir duplicados.
- Validación de compatibilidad entre `assignment_role` y `users.role` (en aplicación/transacción); administradores acceden globalmente y no requieren asignación.
- **Solo asignable a miembros activos del contrato del servicio** con el rol correspondiente.
- Mantener historial de altas/revocaciones; toda consulta autorizada debe comprobar asignación **activa**.
- Al cambiar rol, resolver/eliminar las asignaciones incompatibles marcándolas revocadas, sin borrar acciones del usuario.

## 4. Catálogos globales

### `catalogs`

`id`, `name`, `description` nullable, `purpose` opcional (`general`/`buildings` para facilitar selección de edificios, no restringir catálogos al resto), `sort_order`, `created_at`, `updated_at`.

### `catalog_items`

`id`, `catalog_id`, `name`, `sort_order`, `created_at`, `updated_at`; índice `(catalog_id, name)` para selección/búsqueda. No forzar nombre global único si dos catálogos o contextos requieren repetidos; decidir validación de duplicados **dentro del mismo catálogo** con UX sin comprometer negocio.

### `catalog_item_relations`

`id`, `from_item_id`, `to_item_id`, `relation_type` opcional, `created_at`; unicidad de par + tipo, sin relaciones consigo mismo, y validación de que enlazan **catálogos distintos**. Como `relation_type` es nullable y en Postgres los `NULL` se consideran distintos, la unicidad del par sin tipo se garantiza con un **índice único parcial** (`... WHERE relation_type IS NULL`); la creación en lote omite los pares ya existentes. El sentido de relación debe ser explícito; no deducir automáticamente jerarquía de padres/hijos.

### Reutilización y eliminación

- `works.catalog_item_id` y `elements.catalog_item_id` son FKs anulables; mostrar `COALESCE(catalog_items.name, custom_name)` con la invariante de que el objeto tiene **exactamente** vínculo o `custom_name` significativo.
- Un servicio puede incluir `building_catalog_item_id` y `building_name_snapshot` nullable como fallback cuando se borra el ítem; al editar edificio, actualizar ambos cuidadosamente.
- **Borrar ítem de catálogo:** dentro de transacción bloquear referencias pertinentes, escribir nombre actual en `custom_name` de trabajos/elementos vinculados, anular `catalog_item_id`; para servicios guardar snapshot y anular FK; borrar relaciones; borrar ítem.
- **Renombrar instancia concreta:** almacenar nuevo `custom_name` y anular `catalog_item_id`, atómicamente.
- No aplicar FK `ON DELETE CASCADE` desde `catalog_items` hacia trabajos, elementos, servicios, fotos o revisiones.

## 5. Servicios y trabajos

### `services`

`id`, `name`, `description` nullable, `building_catalog_item_id` nullable, `building_name_snapshot` nullable, `created_by`, `created_at`, `updated_at`.

Estado y porcentaje derivados de trabajos. No guardar `completed=true` como fuente de verdad si pudiera quedar obsoleto. Se puede mantener cache con invalidación consistente si el rendimiento lo justifica.

### `works`

`id`, `service_id`, `mode` (`direct`/`divided`), `catalog_item_id` nullable, `custom_name` nullable, `description` nullable, `sort_order`, `created_at`, `updated_at`.

- Para `direct`, debe existir un único `evidence_target` de trabajo y **cero** elementos.
- Para `divided`, no puede existir evidencia directa en el padre y puede haber N elementos.
- La integridad entre modo, elementos y targets es **cross-table**: protegerla con transacciones del dominio y, donde resulte mantenible, triggers/constraints diferidas.
- Al cambiar modo, bloquear trabajo, comprobar **no existe ninguna** entrega de sus objetivos (incluidas históricas), reasignar elementos/requisitos/fotos manualmente y actualizar estructuras en una transacción.

### `elements`

`id`, `work_id`, `catalog_item_id` nullable, `custom_name` nullable, `description` nullable, `sort_order`, `created_at`, `updated_at`.

Solo pertenecen a trabajos `divided`, cada elemento tiene exactamente un `evidence_target`. Nombre visible calculado como para trabajos. Un elemento de una UMA puede compartir ítem de catálogo con otro elemento bajo distinto trabajo; **son instancias distintas**.

## 6. Objetivos, requisitos y fotos actuales

### `evidence_targets`

`id`, `work_id` nullable, `element_id` nullable, `current_status` enum, `version` integer/bigint (inicia 0), `latest_submission_id` nullable, `created_at`, `updated_at`.

**CHECK:** exactamente uno entre `work_id` y `element_id` es no nulo (XOR). `UNIQUE(work_id)` para targets directos y `UNIQUE(element_id)` para elementos. El servidor debe verificar que `work.mode` coincide con la forma del target. `version` aumenta con cada cambio significativo de evidencia/estructura, y es el token de concurrencia optimista.

Estado permitido: `pending`, `in_progress`, `in_review`, `rejected`, `approved`. La transición es **administrada por servidor**; no permitir que un PATCH arbitrario la establezca. Los campos pueden ser cache derivada de última entrega + conteo de fotos; cualquiera que sea la estrategia, debe permanecer consistente en transacciones.

### `photo_requirements`

`id`, `target_id`, `catalog_item_id` (FK anulable a `catalog_items`), `custom_name` (texto), `is_required` (default true), `sort_order`, `created_at`, `updated_at`.

- El nombre visible es `COALESCE(catalog_items.name, photo_requirements.custom_name)`, con **origen XOR**: o un ítem de un catálogo de propósito `requirements` (nombre **dinámico**) o un nombre propio.
- Renombrar el requisito a mano lo **desvincula** (guarda `custom_name`); renombrar el ítem del catálogo actualiza los requisitos aún ligados. Borrar el ítem/catálogo copia el último nombre a `custom_name` y desvincula.
- Requisitos son por **target**, no por servicio/trabajo dividido como una plantilla global mutable; el catálogo de requisitos es una lista de nombres reutilizables, no la estructura del requisito.
- La creación de trabajos, la generación en lote y el alta de elementos aceptan un conjunto de requisitos que se inserta (helper `insertRequirements`) en el objetivo directo o en **cada** elemento, omitiendo duplicados por nombre.
- La condición «nunca se envió» equivale a `NOT EXISTS (SELECT 1 FROM evidence_submissions WHERE target_id=...)`, no a `latest_status <> in_review`.
- Después de primer envío: bloquear mutaciones del requisito incluso si se rechazó. Las entregas ya guardan `requirement_name_snapshot`, así que el historial no cambia.
- El grupo **Adicionales** es representado por `requirement_id NULL`, **no** una fila obligatoria ni un requisito borrable.
- Al borrar requisito antes de primer envío: actualizar fotos vigentes a `requirement_id NULL`, preservar autoría y orden, resolver conflictos de posición en adicionales, incrementar `evidence_targets.version` y borrar requisito, todo atómico.

### `photos`

| Campo | Función |
|---|---|
| `id` PK | Identidad estable de fotografía |
| `target_id` FK | Objetivo cuya evidencia la contiene o contuvo |
| `requirement_id` nullable FK | Sección vigente; `NULL` = adicionales |
| `sort_order` | Orden vigente dentro de grupo |
| `storage_path`, `thumbnail_path` | Rutas **relativas internas**, generadas por servidor, no URLs públicas |
| `mime_type`, `size_bytes`, `width`, `height`, `checksum` | Metadatos de archivo validado |
| `processing_status` | `processing`/`ready`/`failed` (solo `ready` puede enviarse) |
| `uploaded_by`, `uploaded_at` | Autoría de carga |
| `removed_by`, `removed_at` nullable | Retiro del borrador vigente (soft removal) |

- Evidencia vigente: `removed_at IS NULL` y archivo `ready` para contar/envíos.
- Retirar una foto **no hace hard delete** del registro cuando aparece en una o más `submission_photos`.
- Si no está referenciada por ningún snapshot, el limpiador puede eliminar binarios tras período seguro y conservar, si aplica, `audit_events` de retiro.
- El borrador vigente y snapshots históricos deben evitar cambios del **contenido binario**: una vez `ready`, el archivo es de solo lectura lógica.
- Validar que la foto y el requisito pertenecen al mismo `target_id`; no permitir cambiar grupo por API ordinaria. Las únicas reasignaciones permitidas son asistente de conversión previa a envíos y traslado automático por eliminación de requisito previa a envíos.
- Los procesos de subida deben evitar una fila lista que apunte a un archivo faltante; usar staging, escritura atómica y reparación/limpieza de huérfanos.

## 7. Entregas, fotografías congeladas y revisiones

### `evidence_submissions`

`id`, `target_id`, `sequence_no`, `submitted_by`, `submitted_at`, `evidence_version`, `target_name_snapshot` opcional, `work_name_snapshot` opcional, `service_name_snapshot` opcional.

- `UNIQUE(target_id, sequence_no)`; el número 1, 2, 3… debe asignarse serializando por `target_id`.
- **No UPDATE/DELETE de entregas desde flujos ordinarios**; DELETE solo como cascada explícita de borrado administrativo destructivo.
- No guardar fotos solo como matriz JSON: preservar referencias FK individuales y metadatos de la instantánea.

### `submission_photos`

`id`, `submission_id`, `photo_id`, `group_kind` (`requirement`/`additional`), `requirement_name_snapshot` nullable, `group_sort_order`, `photo_sort_order`, `photo_uploaded_by_snapshot` opcional, `photo_uploaded_at_snapshot` opcional.

- La fila registra foto exacta, **sección y orden originales**, independientemente de renombres o movimientos del borrador vigente.
- Unicidad `(submission_id, photo_id)`; permitir la **misma foto** en varias entregas distintas del mismo objetivo.
- `photo_id` con `ON DELETE RESTRICT` en borrados ordinarios; la eliminación destructiva debe orquestar primero snapshots o usar cascada dentro de ámbito confirmado.
- La consulta de historial se basa **exclusivamente en `submission_photos`**, jamás en `photos.removed_at` o posiciones vigentes.

### `reviews`

`id`, `submission_id` UNIQUE, `reviewer_id`, `decision` (`approved`/`rejected`), `reason` nullable, `reviewed_at`.

- `CHECK`: rechazo → `reason IS NOT NULL` y, tras `trim`, no vacío (validación fuerte en aplicación y complementaria en BD); aprobación → motivo opcional/nulo.
- Máximo **una** revisión por entrega. Enlace a la entrega pendiente más reciente del objetivo.
- Una revisión **no se edita ni sustituye**. El cambio de `current_status` debe realizarse dentro de la misma transacción.
- Si se rechaza, queda disponible nueva entrega, sin borrar la anterior.

## 8. Notificaciones y auditoría

### `notifications`

`id`, `recipient_user_id`, `service_id`, `target_id` nullable, `submission_id` nullable, `review_id` nullable, `event_type`, `title`, `body`, `deep_link`, `created_at`, `read_at` nullable, `event_key`.

- Unicidad `(recipient_user_id, event_key)` para evitar duplicados por reintentos.
- Crear notificaciones **dentro de la transacción** del envío/revisión después de resolver destinatarios activos asignados; envío push **después** de commit.
- Si se borra destructivamente un servicio/objetivo, eliminar o invalidar coherentemente las notificaciones que apuntaban a él, según la política definida; no dejar deep links rotos sin explicación.

### `push_subscriptions`

`id`, `user_id`, `endpoint` unique, `p256dh`, `auth`, `created_at`, `last_success_at` nullable, `revoked_at` nullable; opcional `device_label` o `user_agent` mínimo. Tratar endpoint/claves como secretos operacionales; permitir eliminar suscripciones inválidas. VAPID private key vive **solo en secretos de entorno**.

### `audit_events`

`id`, `actor_user_id`, `service_id` nullable, `entity_type`, `entity_id`, `action`, `metadata_json` (sin secretos), `created_at`; rastrear como mínimo cambios críticos (roles, asignaciones, cambios de modo, borrados, subidas/retiradas, envíos y revisiones). La auditoría no sustituye snapshots históricos ni impide borrado explícito de servicio.

## 9. Algoritmos transaccionales esenciales

### 9.1 Subida (append no destructivo)

1. Validar acceso a objetivo y estado editable.
2. Aceptar archivo en almacenamiento temporal seguro; validar MIME real/tamaño, procesar y confirmar archivo listo.
3. En transacción bloquear `evidence_target` o usar operación atómica; revalidar editable y asignación.
4. Insertar `photos` en su sección, asignar siguiente posición, incrementar `version`, cambiar `pending → in_progress` cuando corresponda; `rejected` se conserva.
5. Si falla paso 3 o después, limpiar archivo temporal/original huérfano sin dañar snapshots.

### 9.2 Quitar y ordenar fotos

1. Validar `expected_version` de cliente y estado editable.
2. Aplicar compare-and-swap `UPDATE evidence_targets ... WHERE version=:expected AND current_status IN (...)`, o bloqueo equivalente que garantice mismo resultado.
3. Quitar = marcar `removed_at` y actor; ordenar = validar conjunto exacto de fotos del grupo y actualizar posiciones sin duplicados.
4. Incrementar versión una sola vez por operación; `409` si version no coincide o cambió estado.

### 9.3 Enviar entrega

1. Iniciar transacción y bloquear fila de `evidence_targets` (`SELECT ... FOR UPDATE`).
2. Verificar acceso, estado editable, `expected_version` y ausencia de fotos `processing` pendientes de incluir; consultar fotos `ready` no retiradas por grupo.
3. Validar **cada requisito requerido** con ≥1 foto y, si no hay requeridos, ≥1 foto total.
4. Calcular siguiente `sequence_no`; insertar `evidence_submissions` con autor/fecha/versión.
5. Insertar `submission_photos` con ID, grupo, nombre y posición congelados, incluidos adicionales.
6. Actualizar `current_status='in_review'`, `latest_submission_id` y `version=version+1`.
7. Insertar notificaciones internas de supervisores asignados activos y administradores activos (excepto el emisor) usando clave de evento idempotente; commit.
8. **Después del commit**, intentar Web Push, con tolerancia a error.

### 9.4 Revisar

1. Abrir transacción, bloquear target y verificar que `latest_submission_id` coincide con entrega solicitada y estado `in_review`.
2. Verificar supervisor actualmente asignado/admin, usuario activo; validar confirmación de intención en UI (en servidor la decisión y razón bastan; nunca confiar solo en JS).
3. Insertar `reviews` UNIQUE por submission; `reason` requerido al rechazar.
4. Actualizar estado objetivo a `approved` o `rejected`; incrementar versión e insertar notificaciones de técnicos asignados activos y administradores activos (excepto el revisor).
5. Commit, Web Push best effort. Revisión simultánea incompatible produce `409`, nunca una segunda decisión.

### 9.5 Borrar catálogo/servicio

- **Ítem catálogo:** transacción de **desvinculación preservadora**, descrita en §4. Nunca dispara cascadas a evidencia.
- **Servicio/trabajo/elemento:** primero mostrar impacto y obtener confirmación; transacción borra los registros y snapshots de ese alcance, y registra evento de eliminación según política. Los archivos físicos asociados se borran **después del commit** mediante lista segura de limpieza o recolector, nunca antes. Evitar archivos huérfanos permanentes.
- Un borrado parcial, como un elemento, conserva todos los demás elementos y sus snapshots/revisiones.

## 10. Cálculo de estados agregados

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

El porcentaje de avance puede usar **objetivos aprobados / objetivos totales**, indicando separados los trabajos divididos vacíos para que nunca se reporte falsamente 100 %. Si el servicio tiene trabajos pero un trabajo dividido sin elementos, el estado global será incompleto sin importar porcentajes de otros objetivos. El porcentaje es informativo; el criterio de completado es el predicado anterior.

## 11. Índices y constraints recomendados

- `users(username_normalized)` unique; `sessions(user_id, expires_at)`.
- `service_assignments(service_id, user_id, assignment_role)` unique parcial activo; `(user_id, revoked_at)` para filtros.
- `works(service_id, sort_order)`, `elements(work_id, sort_order)`.
- `works(catalog_item_id)`, `elements(catalog_item_id)`, `services(building_catalog_item_id)`.
- `catalog_item_relations(from_item_id, to_item_id, relation_type)` unique.
- `evidence_targets(work_id)` unique nullable, `(element_id)` unique nullable.
- `photo_requirements(target_id, sort_order)`; `photos(target_id, removed_at, requirement_id, sort_order)`.
- `evidence_submissions(target_id, sequence_no DESC)` unique; `submission_photos(submission_id, group_sort_order, photo_sort_order)`.
- `reviews(submission_id)` unique; `notifications(recipient_user_id, read_at, created_at DESC)`; `notifications(recipient_user_id,event_key)` unique.
- Índices `pg_trgm` opcionales para nombres si búsquedas con `ILIKE` se vuelven lentas; en decenas de usuarios no exigir motor de búsqueda externo.

## 12. Políticas de integridad y seguridad de datos

- Transacciones del ORM + validación server-side; FKs/constraints SQL como defensa en profundidad.
- No borrar ni modificar una entrega/revisión durante operación normal. SQL de aplicación debe evitar endpoints genéricos que acepten UPDATE de estos registros.
- Proteger importaciones/exportaciones de traversal, CSV formula injection, ZIP Slip al construir paths y recursos agotados.
- Respaldar **BD + directorio de fotos** en un conjunto coherente. Restaurar uno sin el otro puede romper snapshots.
- Migraciones deben mantener datos históricos; añadir columnas con defaults/backfills y no resetear BD de producción.
- Probar eliminación de recurso y limpieza de binarios sobre entornos con snapshots referenciados; no violar `RESTRICT` inadvertidamente.
