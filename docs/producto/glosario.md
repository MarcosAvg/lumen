# Glosario

> **Audiencia:** todo el equipo.
> **Estado:** vigente.

Términos del dominio y convenciones de lenguaje. En prosa se usa la columna
«Término»; la columna «En código» se reserva para tablas, tipos y endpoints.

| Término | En código | Significado |
|---|---|---|
| **Contrato** | `contract` | Nivel superior; agrupa servicios y define sus participantes |
| **Servicio** | `service` | Unidad contenedora dentro de un contrato; agrupa trabajos |
| **Trabajo** | `work` | Actividad de un servicio; puede ser directo o dividido |
| **Elemento** | `element` | Subunidad de un trabajo dividido |
| **Objetivo** | `target` / `evidence_target` | Unidad de evidencia: un trabajo directo o un elemento |
| **Requisito** | `photo_requirement` | Grupo nombrado de fotos dentro de un objetivo |
| **Sección** | — | Nombre visible de un requisito en la pantalla de captura |
| **Adicionales** | `requirement_id = NULL` | Grupo virtual de fotos sin requisito |
| **Evidencia vigente** | `photos` con `removed_at IS NULL` | Colección editable actual de un objetivo |
| **Borrador** | — | La evidencia vigente cuando todavía es editable |
| **Entrega** | `submission` / `evidence_submission` | Instantánea inmutable de la evidencia |
| **Revisión** | `review` | Decisión de aprobar o rechazar una entrega |
| **Catálogo** | `catalog` | Lista reutilizable de nombres con un propósito |
| **Ítem de catálogo** | `catalog_item` | Entrada de un catálogo |
| **Nombre vinculado** | `catalog_item_id` | Nombre que se resuelve dinámicamente desde el catálogo |
| **Nombre propio** | `custom_name` | Nombre independiente del catálogo |
| **Ámbito** | — | Contratos y servicios a los que un usuario tiene acceso |
| **Actor** | `actor_user_id` | Usuario que ejecuta una acción auditada |
| **Administrador** | rol `admin` | Acceso global y gestión completa |
| **Supervisor** | rol `supervisor` | Revisa y consulta dentro de su ámbito; no captura |
| **Técnico** | rol `technician` | Captura y envía evidencia; no revisa ni exporta ZIP |
| **Web Push** | `push_subscription` | Canal de notificación del navegador; siempre best effort |
| **Bandeja interna** | `notification` | Avisos persistentes dentro de Lumen |
| **ZIP de entrega** | `submission export` | Snapshot de una entrega concreta |
| **ZIP de ámbito** | `service/work/contract export` | Exportación de la última entrega aprobada de cada objetivo |
| **XLSX** | `workbook` | Registro de estado incluido opcionalmente en un ZIP |
| **PDF de evidencia** | `work PDF` | PDF por trabajo con fotos de la última entrega aprobada |

## Convenciones de lenguaje

- «Objetivo» en documentación funcional; `target` solo en contexto técnico.
- «Entrega» y «revisión» en prosa; `submission` y `review` en código.
- «Requisito» para la entidad; «sección» para su presentación plegable.
- «ZIP de entrega», «ZIP de servicio», «ZIP de trabajo» y «ZIP de contrato»;
  evitar «ZIP por entrega» como término genérico.
- «Administrador», «supervisor» y «técnico» en minúscula cuando describen
  personas; en mayúscula solo al inicio de frase o en una tabla de roles.
- «Origen público» o «URL pública», no «dominio horneado».
