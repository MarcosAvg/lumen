# API y endpoints

> **Audiencia:** desarrollo e integraciones internas.
> **Estado:** vigente.
> **Fuente canónica de:** rutas HTTP, permisos y códigos de error.

La ruta exacta puede variar según la convención de SvelteKit, pero los recursos
lógicos y las precondiciones son el contrato. No se usan CRUD genéricos para
entidades inmutables o estados críticos. Las acciones de formulario de SvelteKit
son la vía normal para formularios; los endpoints HTTP se reservan para cargas,
miniaturas, búsqueda, push y streaming.

## 1. Endpoints

| Método / acción | Recurso | Quién | Precondición |
|---|---|---|---|
| POST | `/login` | Público | Credenciales válidas y cuenta activa |
| POST | `/setup` | Primer arranque | Aún no existe administrador; transacción serializada |
| POST | `/logout` | Sesión activa | Cierra la sesión |
| Acción server | Crear/editar/borrar contrato | Admin | Datos válidos; sin servicios para borrar |
| Acción server | Cambiar ciclo de vida del contrato | Admin | `inactive` sin servicios activos/en espera; `archived` con todos archivados; terminal |
| Acción server | Gestionar participantes de contrato | Admin o supervisor del contrato | Miembros activos; no dejar contrato sin participantes válidos |
| Acción server | Crear/editar/borrar servicio | Admin | Contrato activo para crear/mover; datos válidos |
| Acción server | Cambiar ciclo de vida del servicio | Admin | `planned` solo al crear; `active` con contrato activo; `archived` solo si completado; terminal |
| Acción server | Asignar/revocar servicio | Admin o supervisor del contrato | El usuario debe ser miembro del contrato; el admin puede incorporarlo |
| Acción server | Crear/editar trabajo, elementos y requisitos | Admin | Estructura y estado editables |
| POST | `/api/works/:id/convert` | Admin | Sin entregas históricas; mapa completo; versión |
| POST | `/api/targets/:id/requirements` | Admin | Objetivo editable; requisito válido |
| POST | `/api/targets/:id/requirements/batch` | Admin | Objetivo editable; selección de catálogo válida |
| POST | `/api/targets/:id/photos` | Técnico o admin | Acceso, estado editable, archivo válido |
| DELETE | `/api/targets/:id/photos/:photoId` | Técnico o admin | Acceso, estado editable, versión vigente |
| PUT | `/api/targets/:id/photo-order` | Técnico o admin | Acceso, grupo consistente, versión vigente |
| POST | `/api/targets/:id/submit` | Técnico o admin | Requisitos válidos, versión vigente |
| POST | `/api/submissions/:id/review` | Supervisor asignado o admin | Entrega en revisión; motivo si rechazo |
| GET | `/api/photos/:id/content` | Ámbito de servicio | Autorización; nunca se sirve el path del volumen |
| GET | `/api/photos/:id/thumbnail` | Ámbito de servicio | Misma autorización que la foto |
| GET | `/api/submissions/:id/export.zip` | Admin o supervisor asignado | ZIP del snapshot; técnicos `403` |
| GET | `/api/services/:id/export.zip` | Admin o supervisor asignado | Última entrega aprobada + extras opcionales |
| GET | `/api/services/:id/export.pdf` | Admin o supervisor asignado | PDF recopilado; `409` si no hay evidencia aprobada |
| GET | `/api/works/:id/export.zip` | Admin o supervisor asignado | Última entrega aprobada + extras opcionales |
| GET | `/api/contracts/:id/export.zip` | Admin o supervisor del contrato | Última entrega aprobada + extras opcionales |
| GET | `/api/contracts/:id/pdf-background` | Miembros del contrato | Fondo PNG del contrato |
| Acción server | Configurar fondo y márgenes del contrato | Admin | PNG/JPG válido; márgenes 10–80 mm |
| GET | `/api/search?q=...&type=...&serviceId=...` | Sesión activa | Resultados filtrados por ámbito |
| POST | `/api/push/subscriptions` | Sesión activa | Endpoint y claves válidos |
| GET | `/health` | Público | Base de datos y migraciones disponibles |

### Parámetros de exportación

Los ZIP de ámbito aceptan:

```text
?variant=simple|extended&xlsx=0|1&photos=0|1&pdf=0|1&compiledPdf=0|1
```

Debe incluirse al menos un contenido. Los detalles de jerarquía, XLSX y PDF
están en [`exportaciones.md`](exportaciones.md).

## 2. Códigos de error

| Código | Uso |
|---|---|
| `400` | Validación de entrada |
| `401` | Sesión ausente o inválida |
| `403` | Rol insuficiente o acción no permitida |
| `404` | Recurso inexistente o fuera del ámbito; se usa también para no filtrar existencia |
| `409` | Conflicto de versión, estado o precondición de negocio |
| `413` | Archivo o cuerpo demasiado grande |
| `415` | Formato de archivo no soportado |
| `500` | Fallo interno sin detalles sensibles |

Las respuestas de ámbito usan `404` opaco cuando revelar la existencia del
recurso sería una fuga de información. La UI traduce los códigos a mensajes
accionables; nunca muestra trazas ni secretos.

## 3. Invariantes de autorización

- Toda lectura, escritura, búsqueda, descarga y exportación comprueba el ámbito
  en servidor.
- Un ID difícil de adivinar no sustituye una comprobación de permisos.
- El usuario activo se resuelve en cada petición; no se confía en permisos
  cacheados en la cookie.
- Los técnicos no revisan ni exportan ZIP.
- Los supervisores no capturan ni modifican evidencia.
- Un servicio `planned` o `inactive` bloquea captura, envío, revisión y cambios
  de requisitos con `409`; un servicio `archived` es de solo lectura.
- Las lecturas y exportaciones de recursos archivados conservan el ámbito y
  siguen auditadas.
- Los administradores no necesitan asignación, pero sus acciones quedan
  auditadas.
- Los enlaces profundos de notificaciones revalidan permisos al abrirse.
