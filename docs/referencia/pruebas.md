# Pruebas y criterios de aceptación

> **Audiencia:** desarrollo, QA y revisión de cambios.
> **Estado:** vigente.
> **Fuente canónica de:** capas de prueba, matriz obligatoria y definición de
> terminado.

El estado detallado de la implementación está en
[`../../IMPLEMENTATION_STATUS.md`](../../IMPLEMENTATION_STATUS.md).

## 1. Capas de prueba

| Capa | Comando | Alcance |
|---|---|---|
| Tipos | `pnpm check` | SvelteKit, TypeScript y componentes |
| Estilo | `pnpm lint` | Prettier + ESLint |
| Unitarias | `pnpm test` | Reglas puras, utilidades y componentes |
| Integración | `pnpm test:integration` | PostgreSQL real, transacciones y constraints |
| E2E | `pnpm test:e2e` | Flujos críticos en escritorio y móvil |
| Build | `pnpm build` | Build de producción con adapter-node |

Las pruebas de concurrencia usan transacciones y sesiones reales de PostgreSQL,
no mocks que omitan locks.

## 2. Definición de terminado

Una función está terminada cuando:

1. Cumple las reglas de negocio y permisos en UI y servidor.
2. Persiste de forma transaccional y maneja errores y concurrencia.
3. Incluye estados de carga, vacío, fallo y conflicto cuando aplica.
4. Tiene pruebas positivas, negativas y de acceso indebido.
5. Está documentada en el documento canónico correspondiente.
6. Funciona en un entorno local reproducible con Docker.
7. No añade servicios externos obligatorios fuera del stack acordado.

## 3. Matriz obligatoria

| ID | Escenario | Resultado esperado |
|---|---|---|
| AUTH-01 | Técnico consulta un servicio no asignado | Bloqueado en servidor |
| AUTH-02 | Supervisor intenta subir una foto | Bloqueado |
| AUTH-03 | Admin revisa un envío de cualquier servicio | Permitido |
| AUTH-04 | Desactivar un usuario con sesión abierta | Sesión inutilizable; autoría conservada |
| AUTH-05 | Desactivar o degradar al último admin | Bloqueado |
| AUTH-06 | Supervisor del contrato asigna un servicio a un miembro | Permitido |
| AUTH-07 | Supervisor intenta asignar a alguien ajeno al contrato | `409` |
| CAT-01 | Renombrar un ítem maestro | Solo cambian los registros vinculados |
| CAT-02 | Renombrar una instancia vinculada | Se desvincula y conserva su nombre |
| CAT-03 | Borrar un ítem usado por trabajos o edificio | Se conservan nombres y fotos |
| WORK-01 | Trabajo dividido vacío | No aprobado |
| WORK-02 | Añadir elemento a un trabajo aprobado | Incompleto; aprobaciones intactas |
| WORK-03 | Conversión tras un envío rechazado | Prohibida |
| WORK-04 | Conversión sin envío con fotos y requisitos | Todo se reasigna o no cambia nada |
| REQ-01 | Requisito obligatorio sin foto | Envío rechazado |
| REQ-02 | Sin requisitos obligatorios y cero fotos | Envío rechazado |
| REQ-03 | Eliminar requisito antes del envío | Fotos pasan a Adicionales |
| REQ-04 | Editar requisitos después del primer envío | Prohibido |
| PHOTO-01 | Dos técnicos suben a la vez | Ambas fotos y autores preservados |
| PHOTO-02 | Cliente ordena con versión vieja | `409`, sin sobrescribir |
| PHOTO-03 | Intentar mover una foto de requisito | No existe operación permitida |
| PHOTO-04 | Retirar una foto usada en una entrega vieja | Foto histórica visible y descargable |
| SUB-01 | Enviar mientras otro edita | Snapshot consistente o conflicto |
| SUB-02 | Enviar de nuevo estando en revisión | Bloqueado |
| REV-01 | Rechazar sin motivo | Bloqueado |
| REV-02 | Dos supervisores revisan la misma entrega | Exactamente una revisión |
| REV-03 | Rechazo → corrección → reenvío | Snapshots distintos e inmutables |
| NOTIF-01 | Falla el push | Bandeja y operación persisten |
| NOTIF-02 | Usuario no asignado abre un deep link viejo | Acceso bloqueado |
| NOTIF-03 | Envío o revisión | Supervisores/técnicos asignados y administradores activos reciben bandeja; el actor queda excluido |
| EXP-01 | Exportar una entrega histórica | Fotos y secciones del snapshot correcto |
| EXP-02 | ZIP de servicio parcialmente aprobado | Solo aprobados; XLSX con todo el estado |
| EXP-03 | Técnico solicita ZIP de contrato, servicio o trabajo | `403` |
| EXP-04 | ZIP de entrega solicitado por técnico | `403` |
| SEARCH-01 | Buscar un recurso no asignado | No aparece |
| DEL-01 | Borrar un servicio con historial | Confirmación, cascada acotada y limpieza posterior |
| CAT-04 | Migrar un catálogo con propósito requirements | Selector y vínculos correctos |
| UI-01 | Alta sin selección inicial | Ningún desplegable obligatorio preselecciona el primer registro |
| UI-02 | Catálogos en un contexto mixto | Agrupados por Generales, Edificios y Requisitos |
| UI-03 | Asignación sin rol ni persona | Añadir deshabilitado hasta completar |
| PANEL-01 | Panel de administrador | Agregados globales, contratos, tendencia y cola sin datos ajenos |
| PANEL-02 | Panel de supervisor | Solo servicios y contratos asignados; cola y decisiones acotadas |
| PANEL-03 | Cola de revisión | Orden por antigüedad y aviso visual a partir de 24 h |
| PANEL-04 | Panel del técnico | Primero trabajos rechazados/pendientes; límites 3/5/6 y enlace a Servicios |
| LIFE-01 | Servicio `planned` o `inactive` | Estructura consultable; captura, envío y revisión bloqueados con `409` |
| LIFE-02 | Archivar servicio incompleto | Bloqueado; el servicio sigue operativo |
| LIFE-03 | Archivar servicio completado y luego el contrato | Permitido; aprobaciones y fotos intactas; ambos terminales |
| LIFE-04 | Pausar contrato con servicios activos/en espera | Bloqueado con explicación |
| LIFE-05 | Tablero y listados con servicios inactivos/archivados | Agregados solo de activos; filtros permiten consultar el resto |

## 4. Pruebas E2E mínimas

- Configuración inicial y login.
- Crear contrato, usuario, catálogo, servicio, trabajo directo y dividido.
- Captura, envío, aprobación y rechazo con corrección.
- Historial y descargas autorizadas/denegadas.
- Búsqueda filtrada por ámbito.
- Asignaciones y revocaciones.
- Catálogos agrupados y ausencia de valores preseleccionados.
- Ciclo de vida: crear en espera, activar, pausar, archivar completo y filtrar
  archivados en solo lectura.
- Exportaciones ZIP, XLSX y PDF.
- Estados vacíos, error, conflicto y sin permiso.
- Móvil y escritorio.

## 5. Regresión

Cada incidente corregido debe añadir una prueba que falle antes del cambio y pase
después. Las pruebas de permisos deben incluir el acceso por URL directa, no solo
la navegación por UI.
