# Lumen

[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)](https://github.com/MarcosAvg/lumen/actions/workflows/ci.yml)
[![Licencia](https://img.shields.io/badge/licencia-MIT-green?style=flat-square)](LICENSE)
[![Versión](https://img.shields.io/badge/versi%C3%B3n-0.4.1-blue?style=flat-square)](https://github.com/MarcosAvg/lumen/tags)
[![SvelteKit 3](https://img.shields.io/badge/SvelteKit_3-FF3E00?style=flat-square&logo=svelte&logoColor=white)](https://svelte.dev/docs/kit)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL_17-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker Compose](https://img.shields.io/badge/Docker_Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](compose.yaml)

PWA autohospedada para equipos de servicios en campo. Los técnicos capturan
**evidencia fotográfica compartida**, los supervisores asignados la **aprueban o
rechazan por entrega** y la administración organiza contratos, servicios,
trabajos, catálogos y usuarios.

> **Estado:** v1 completa. El detalle de avance y decisiones vive en
> [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).

## Roles

| Rol               | Alcance                         | Puede                                                                                           |
| ----------------- | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Administrador** | Global                          | Gestionar usuarios, contratos, catálogos, servicios y estructura; capturar, revisar y exportar  |
| **Supervisor**    | Contratos y servicios asignados | Consultar, revisar entregas, gestionar asignaciones de servicio de su contrato y exportar ZIP   |
| **Técnico**       | Servicios asignados             | Capturar, ordenar, retirar y enviar evidencia compartida; consultar historial y descargar fotos |

La autorización se resuelve en servidor. Una URL directa, una búsqueda o una
descarga no conceden acceso fuera del ámbito autorizado. Los técnicos no
exportan ZIP; sí descargan fotografías individuales.

## Puesta en marcha

**Requisitos:** Docker + Docker Compose v2, un dominio en Cloudflare y
`cloudflared` (en Docker o en el host).

```bash
git clone https://github.com/MarcosAvg/lumen.git
cd lumen
./install.sh --email tu@correo
```

`install.sh` genera `.env`, las claves VAPID y arranca la aplicación. También
puede usarse un `.env` propio:

```bash
docker compose pull
docker compose up -d
```

La aplicación se publica en la red Docker `proxy` como `lumen:3000`, sin abrir
puertos en el host. Después se configura el dominio en Cloudflare Tunnel y se
completa **Configurar Lumen** para crear la cuenta administradora.

La guía completa está en [`docs/guias/instalacion.md`](docs/guias/instalacion.md).

## Documentación

| Necesito…                                       | Documento                                                    |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Instalar y publicar Lumen                       | [`docs/guias/instalacion.md`](docs/guias/instalacion.md)     |
| Actualizar, respaldar o resolver fallos         | [`docs/guias/operacion.md`](docs/guias/operacion.md)         |
| Entender reglas, roles e invariantes            | [`docs/producto/reglas.md`](docs/producto/reglas.md)         |
| Capturar y enviar evidencia                     | [`docs/guias/tecnico.md`](docs/guias/tecnico.md)             |
| Revisar entregas                                | [`docs/guias/supervisor.md`](docs/guias/supervisor.md)       |
| Administrar contratos, catálogos y estructura   | [`docs/guias/administrador.md`](docs/guias/administrador.md) |
| Desarrollar o ejecutar pruebas                  | [`docs/desarrollo/setup.md`](docs/desarrollo/setup.md)       |
| Consultar API, datos, variables o exportaciones | [`referencia técnica`](docs/README.md#mapa-canónico)         |

El portal completo, con el mapa canónico y la correspondencia con documentos
anteriores, está en [`docs/README.md`](docs/README.md).

## Stack y alcance

**Stack:** Svelte 5 + SvelteKit 3 + TypeScript · Tailwind CSS + shadcn-svelte ·
PostgreSQL 17 + Drizzle ORM/Kit · Docker Compose + Cloudflare Tunnel · Web Push
VAPID con bandeja interna persistente · `sharp`, `archiver`, `exceljs` y
`pdf-lib`.

**Fuera de alcance de la v1:** trabajo offline con sincronización, mensajería
entre usuarios, comentarios o revisión por fotografía individual, estados
manuales de cierre, multi-tenant, ERP o facturación, firma digital e informes PDF
de negocio. El PDF de evidencia por trabajo sí forma parte de la v1.

## Contribuir

Antes de abrir un pull request:

1. Ejecutar `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:integration` y
   `pnpm test:e2e`.
2. Mantener la coherencia con la documentación canónica y actualizar el
   documento afectado en el mismo cambio.
3. Añadir pruebas de regresión al corregir un incidente.

Las reglas de trabajo para agentes y colaboradores están en
[`AGENTS.md`](AGENTS.md).

## Licencia

Distribuido bajo licencia **MIT**. Consultar [`LICENSE`](LICENSE).

Copyright © 2026 Marcos Valenzuela.
