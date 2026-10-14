# Lumen

**Lumen** es una aplicación web progresiva (PWA), autohospedada y orientada a equipos pequeños de servicios en campo. Permite que los técnicos capturen **evidencia fotográfica compartida**, que supervisores asignados la **aprueben o rechacen por entrega** y que administradores organicen servicios, trabajos, catálogos y usuarios.

> **Estado:** especificación funcional y técnica para construir la versión 1 (v1). Este repositorio de documentación **no es todavía una aplicación ejecutable**. Los ejemplos de rutas, entidades y parámetros sirven como contrato de implementación; pueden concretarse durante el desarrollo sin cambiar las reglas de negocio aprobadas.

## Qué resuelve

- Organizar **servicios** que contienen **trabajos**; un trabajo puede ser **directo** o estar **dividido en elementos**.
- Configurar requisitos fotográficos **obligatorios u opcionales** (p. ej. Antes, Durante, Después), permitiendo siempre fotos adicionales.
- Permitir que varios técnicos asignados colaboren sobre **una sola evidencia compartida** por trabajo directo o elemento.
- Enviar **entregas inmutables** a revisión; conservar fotografías y decisiones de versiones anteriores aunque la evidencia vigente se corrija.
- Avisar de entregas y decisiones mediante **bandeja interna** y **Web Push**.
- Buscar servicios, trabajos y elementos globalmente según permisos.
- Descargar fotografías, ZIP por entrega, ZIP por servicio y CSV administrativos.

## Roles

| Rol               | Alcance                  | Operaciones principales                                                                                             |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Administrador** | Todos los servicios      | Gestionar usuarios, roles, asignaciones, catálogos, servicios, trabajos y requisitos; capturar y revisar; exportar  |
| **Supervisor**    | Solo servicios asignados | Consultar evidencias, revisar entregas pendientes, consultar historial y descargar/exportar evidencias              |
| **Técnico**       | Solo servicios asignados | Capturar, retirar y ordenar fotos compartidas; enviar entregas; consultar historial y descargar/exportar evidencias |

La autorización es **del servidor**: una URL directa, descarga o búsqueda no concede acceso fuera de los servicios autorizados.

## Stack acordado

- **Frontend y backend:** Svelte 5, SvelteKit, TypeScript; monolito desplegable.
- **Interfaz:** Tailwind CSS y shadcn-svelte; diseño móvil primero y PWA en línea.
- **Datos:** PostgreSQL + Drizzle ORM / Drizzle Kit.
- **Archivos:** almacenamiento local persistente en volumen Docker (fotografías y miniaturas); metadatos en PostgreSQL.
- **Contenedores:** Docker Compose con aplicación y PostgreSQL. Distribución de imagen de aplicación preferentemente mediante GHCR.
- **Notificaciones:** bandeja interna + Web Push con VAPID y service worker, sin Redis ni Firebase obligatorio.

**Fuera del alcance v1:** sincronización sin conexión, mensajería entre usuarios, comentarios por fotografía, revisión de fotos individuales, gestión integral de contratos/facturación, inventario obligatorio, estructura rígida de activos, edición simultánea en tiempo real mediante WebSockets, informes PDF obligatorios.

## Cómo se usa

1. En el **primer arranque**, se configura una cuenta de administrador local.
2. El administrador crea usuarios, catálogos y servicios; asigna técnicos y supervisores.
3. Define trabajos directos o divididos, elementos y requisitos fotográficos.
4. Los técnicos asignados capturan fotos en las secciones correspondientes y **envían una entrega**.
5. Un supervisor asignado o administrador **confirma** la aprobación, o **confirma** el rechazo indicando un motivo obligatorio.
6. Si se rechaza, los técnicos actualizan la evidencia compartida y envían una nueva versión. El historial anterior queda consultable.
7. El servicio se considera completado automáticamente cuando **todos sus trabajos están aprobados**.

## Documentación de implementación

| Archivo                                                  | Propósito                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                 | Reglas de trabajo para el agente de programación, prioridades y criterios generales |
| [`docs/01-producto.md`](docs/01-producto.md)             | Modelo funcional, reglas, permisos e invariantes                                    |
| [`docs/02-flujos.md`](docs/02-flujos.md)                 | Flujos paso a paso y errores esperados                                              |
| [`docs/03-modelo-datos.md`](docs/03-modelo-datos.md)     | Esquema lógico relacional, integridad, historial y concurrencia                     |
| [`docs/04-arquitectura.md`](docs/04-arquitectura.md)     | Componentes, seguridad, archivos, PWA, Docker, respaldo y API                       |
| [`docs/05-interfaz-pwa.md`](docs/05-interfaz-pwa.md)     | Pantallas, navegación, interacciones y accesibilidad                                |
| [`docs/06-implementacion.md`](docs/06-implementacion.md) | Plan por etapas, pruebas, entrega y criterios de aceptación                         |

**Orden recomendado de lectura para el agente:** `AGENTS.md` → producto → flujos → modelo de datos → arquitectura → interfaz → implementación.

## Principios de producto

1. **La evidencia pertenece al trabajo/elemento, no a un técnico.** Se registra autoría de cada acción, pero la edición es colectiva entre técnicos asignados.
2. **El historial de entregas y revisiones es inmutable** mientras el objeto exista. La eliminación destructiva administrativa de un elemento/trabajo/servicio es una excepción explícita y advertida.
3. **La vista principal siempre muestra evidencia vigente**, y el historial está apartado.
4. **Los catálogos son reutilizables y opcionales**; la aplicación no debe asumir una industria, edificio, marca o tipo de equipo concreto.
5. **No añadir infraestructura sin necesidad:** para equipos pequeños, SvelteKit + PostgreSQL + volúmenes persistentes son suficientes.
6. **Primero consistencia y permisos, luego apariencia:** ninguna operación crítica debe depender solo de validaciones en el navegador.

## Puesta en marcha prevista

La implementación debe incluir `compose.yaml`, `Dockerfile`, `.env.example`, migraciones Drizzle, inicialización del administrador y procedimientos de respaldo/restauración. **No se incluyen aquí credenciales, secretos ni valores de producción.** El despliegue debe estar protegido por HTTPS para el uso correcto de sesiones y Web Push.

Los detalles operativos y las variables previstas se encuentran en [`docs/04-arquitectura.md`](docs/04-arquitectura.md).
