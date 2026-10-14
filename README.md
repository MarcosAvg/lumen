# Lumen

**Lumen** es una aplicación web progresiva (PWA), autohospedada y orientada a equipos pequeños de servicios en campo. Permite que los técnicos capturen **evidencia fotográfica compartida**, que supervisores asignados la **aprueben o rechacen por entrega** y que administradores organicen servicios, trabajos, catálogos y usuarios.

> **Estado:** implementación v1 en curso (Etapas 0–6 completadas: infraestructura, identidad y permisos, catálogos/servicios/trabajos, captura fotográfica, envíos/revisiones y bandeja interna + Web Push). El repositorio ya es una **aplicación ejecutable**; el detalle de avance está en [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md). Los ejemplos de rutas, entidades y parámetros pueden concretarse sin cambiar las reglas de negocio aprobadas.

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

## Desarrollo local

**Requisitos:** Docker + Docker Compose, Node.js ≥ 22 y pnpm 9 (o Corepack).

```bash
git clone https://github.com/MarcosAvg/lumen.git
cd lumen
cp .env.example .env          # ajusta POSTGRES_PASSWORD y ORIGIN si lo necesitas
```

### Aplicación completa con Docker (recomendado para probar el despliegue)

```bash
docker compose up -d --build   # construye la imagen, aplica migraciones y arranca
# App en http://localhost:3000  ·  PostgreSQL publicado en 127.0.0.1:5432
curl http://localhost:3000/health
```

- El puerto publicado es configurable: `APP_PORT=3080 docker compose up -d`.
- `ORIGIN` se incorpora al **build** de la imagen; si cambia, reconstruye con `docker compose build`.
- Primer arranque: abre la app y completa **Configurar Lumen** para crear la cuenta administradora.
- Detener sin perder datos: `docker compose down` (usa `down -v` solo para borrar volúmenes).

### Desarrollo con servidor de Vite (hot reload)

```bash
docker compose up -d db        # solo PostgreSQL (publicado en 127.0.0.1:5432)
pnpm install
pnpm db:migrate                # carga .env automáticamente
pnpm dev                       # http://localhost:5173
```

> En desarrollo, `PHOTO_STORAGE_PATH` apunta a `./data/photos` (ignorado por git). En el contenedor
> de producción se usa el volumen `lumen_photos` en `/data/photos`.

### Comprobaciones y pruebas

```bash
pnpm check            # svelte-check (tipos)
pnpm lint             # Prettier + ESLint
pnpm test             # pruebas unitarias (Vitest)
pnpm test:integration # pruebas con PostgreSQL real (requiere `docker compose up -d db`)
pnpm build            # build de producción (adapter-node)
```

Las pruebas de integración usan `TEST_DATABASE_URL` (por defecto
`postgres://lumen:cambia-esta-clave@127.0.0.1:5432/lumen_test`, que se crea y migra
automáticamente); si no hay PostgreSQL disponible se omiten con un aviso.

### Mantenimiento

```bash
pnpm maintenance:cleanup   # borra temporales y binarios huérfanos (no toca los referenciados)
```

### Notificaciones push (opcional)

La **bandeja interna** funciona siempre. Web Push es opcional y requiere un par de claves
**VAPID** y HTTPS (en iOS, además, añadir la PWA a la pantalla de inicio):

```bash
pnpm vapid:generate        # imprime VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT
# copia el resultado en tu .env (la clave privada es un secreto)
```

Sin esas variables, la app y la bandeja interna siguen siendo plenamente operativas; la página
**Ajustes** indicará «Push no configurado».

### Scripts

| Script                                     | Descripción                                                     |
| ------------------------------------------ | --------------------------------------------------------------- |
| `dev` / `build` / `start`                  | servidor de desarrollo, build de producción, arranque del build |
| `check` / `lint` / `format`                | tipos, lint y formateo                                          |
| `test` / `test:integration`                | pruebas unitarias y con base de datos real                      |
| `db:generate` / `db:migrate` / `db:studio` | migraciones Drizzle (generar, aplicar, explorar)                |
| `maintenance:cleanup`                      | limpieza de archivos temporales/huérfanos                       |
| `vapid:generate`                           | genera un par de claves VAPID para Web Push                     |
