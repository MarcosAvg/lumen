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
| E2E rápido | `pnpm test:e2e` | Todo escritorio + móvil smoke (`@mobile`) |
| E2E completo | `pnpm test:e2e:all` | Escritorio y móvil completos antes de publicar |
| Build | `pnpm build` | Build de producción con adapter-node |

Las pruebas de concurrencia usan transacciones y sesiones reales de PostgreSQL,
no mocks que omitan locks.

Los cambios de paleta o tokens visuales usan `pnpm verify:visual` (lint, build y
prueba de tema). No requieren unitarias, integración ni E2E completo; esos
niveles no detectan contraste ni controles nativos mal tematizados.

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
| EXP-05 | PDF recopilado de un servicio | Portada + una sección por trabajo; excluye trabajos sin evidencia aprobada |
| EXP-06 | ZIP con PDF por trabajo y/o recopilado | Ambas casillas son independientes; el XLSX no cambia |
| EXP-07 | Descargar PDF de servicio sin evidencia aprobada | `409` con mensaje claro; no genera un PDF vacío |
| EXP-08 | ZIP de contrato con recopilados | Un PDF por servicio con evidencia, dentro de su carpeta |
| SEARCH-01 | Buscar un recurso no asignado | No aparece |
| DEL-01 | Borrar un servicio con historial | Confirmación, cascada acotada y limpieza posterior |
| CAT-04 | Catálogo limitado al edificio A usado en servicio B | No aparece en el selector y el servidor responde `409` |
| CAT-05 | Crear, renombrar y eliminar tipos de catálogo | El tipo Edificios y los tipos con catálogos no se eliminan |
| CAT-06 | Selección con varios tipos de catálogo | El filtro por tipo acota la lista y conserva el ítem elegido |
| UI-01 | Alta sin selección inicial | Ningún desplegable obligatorio preselecciona el primer registro |
| UI-02 | Catálogos en un contexto mixto | Agrupados por tipo; los limitados a otros edificios no aparecen |
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
| HEALTH-01 | Base migrada | `/health` responde `200` y `migrations: applied` |
| HEALTH-02 | App nueva con la última migración pendiente | `/health` responde `503` y `migrations: pending` |
| DEPLOY-01 | Actualización sin runner nuevo | `deploy/update.sh` fuerza migración desde la imagen de `app` antes de recrear |

## 4. Pruebas E2E mínimas

La suite E2E cubre recorridos completos y el cableado entre UI y servidor. Las
reglas de negocio se prueban en integración y no se duplican aquí. La suite se
mantiene deliberadamente pequeña: 21 escenarios.

- Configuración inicial, login, perfil y cierre de sesión.
- Flujo crítico: captura, envío, aprobación, rechazo, corrección y reenvío.
- Trabajo directo y dividido: elementos, requisitos y generación en lote.
- Catálogos: tipos, búsqueda de ítems y selección por tipo/catálogo.
- Catálogo de requisitos y checklist de envío.
- Búsqueda filtrada por ámbito, permisos de exportación y cabeceras de seguridad.
- Administración de usuarios y edición de recursos en modal.
- Estados vacíos, 404 y vistas de error.
- Tema claro/oscuro, accesibilidad de formularios y responsive sin overflow.

Quedan cubiertos por integración, sin E2E dedicado: ciclo de vida, contratos,
tablero y agregados, asignaciones/revocaciones, borrado destructivo de servicio
y variantes de exportación ZIP/XLSX/PDF.

## 5. Regresión

Cada incidente corregido debe añadir una prueba que falle antes del cambio y pase
después. Las pruebas de permisos deben incluir el acceso por URL directa, no solo
la navegación por UI.
