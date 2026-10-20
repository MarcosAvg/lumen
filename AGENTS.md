## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: prettier, eslint, vitest, tailwindcss, sveltekit-adapter, drizzle

---

# AGENTS.md — instrucciones para agentes que implementen Lumen

## Objetivo

Construir una **PWA autohospedada, simple, segura y mantenible**, siguiendo exactamente el comportamiento especificado en `docs/`. **No reinterpretar Lumen como un sistema de órdenes de trabajo, ERP, gestor de archivos genérico, checklist por fotografía o plataforma multiempresa/SaaS.**

## Jerarquía documental

1. `docs/producto/reglas.md`: reglas de negocio, roles e invariantes.
2. `docs/producto/flujos.md`: comportamiento observable de cada operación.
3. `docs/referencia/modelo-datos.md`: persistencia y consistencia.
4. `docs/referencia/arquitectura.md` y `docs/referencia/api.md`: decisiones técnicas, seguridad y API.
5. `docs/producto/experiencia.md` y `docs/desarrollo/sistema-ui.md`: UX, pantallas y sistema de UI.
6. `docs/referencia/pruebas.md`: matriz de pruebas y criterios de aceptación.
7. `docs/README.md`: portal y mapa canónico de la documentación.
8. `README.md`: presentación y orientación.

Si hay una tensión entre documentos, **preservar los invariantes de negocio**, documentar la resolución y actualizar los archivos pertinentes en el mismo cambio. No inventar requisitos contradictorios.

## Decisiones técnicas vinculantes

- Svelte 5 + SvelteKit + TypeScript como **monolito** (UI y servidor en un mismo proyecto).
- Tailwind CSS + shadcn-svelte; mobile-first para técnicos, cómodo en escritorio para administración.
- PostgreSQL + Drizzle ORM/Drizzle Kit; migraciones versionadas.
- Docker Compose **autosuficiente**: `docker compose up -d` (o `./install.sh`) levanta app + PostgreSQL + migraciones con valores por defecto; Fotos en volumen local persistente; datos SQL en volumen independiente.
- PWA instalable, con **modo consulta offline de solo lectura** (estructura y estados, sin fotos ni escrituras) y Web Push estándar VAPID e inbox interno. Las escrituras siguen requiriendo conexión.
- Autenticación local por sesión segura en cookie; primera cuenta admin configurada en el primer arranque.
- No añadir Redis, S3, Firebase, colas externas, microservicios, WebSockets ni servicios cloud obligatorios por defecto.
- Imagen publicable en GHCR usada **por defecto** por Compose (o `--build` para compilar en local); **origen público en runtime** (no hornear `ORIGIN`); la app se une a la red externa `proxy` y se alcanza como `lumen:3000`, **sin publicar puertos en el host**. El dominio se expone con **Cloudflare Tunnel** (`cloudflared` en Docker); si corriera en el host, se añade un `compose.override.yaml` local con `ports`. El proxy inverso (p. ej. Nginx Proxy Manager) queda para otros servicios.

## Invariantes que nunca deben romperse

1. El **ámbito de acceso** se verifica en cada lectura, escritura, descarga, exportación, búsqueda y enlace profundo. La jerarquía es **contrato → servicio → trabajo/elemento**: el contrato agrupa servicios y define a sus participantes (técnicos y supervisores). Solo administradores (global) y participantes del contrato acceden a sus servicios; asignar un servicio exige que el usuario sea participante del contrato.
2. **Solo técnicos asignados y administradores** pueden editar fotos o enviar entregas; los supervisores asignados solo revisan/consultan.
3. Una unidad de evidencia es **el trabajo directo** o **cada elemento** del trabajo dividido, nunca ambos a la vez.
4. Una entrega es una **instantánea inmutable** de las fotos, secciones y orden. Las revisiones se anexan, no editan entregas antiguas.
5. **Rechazar** exige razón no vacía; **aprobar y rechazar** exigen confirmación en UI. La decisión se valida y ejecuta atómicamente en servidor.
6. Los estados `in_review` y `approved` bloquean edición de evidencia. `rejected` permite corregir y reenviar.
7. Los requisitos se congelan **tras el primer envío** de su unidad de evidencia; no basta con comprobar el estado actual.
8. Convertir trabajo `direct` ↔ `divided` es posible **solo antes de cualquier envío** en el trabajo y exige reasignación manual de fotografías y requisitos, sin pérdidas silenciosas.
9. Los nombres asociados a catálogos se resuelven dinámicamente; la **renominación individual desvincula** y conserva un nombre propio.
10. Al eliminar un ítem de catálogo, los registros enlazados **se desvinculan copiando el último nombre**; nunca se pierden evidencias por ello.
11. La gestión estructural administrativa puede alterar avances ya aprobados (p. ej. añadir elemento pendiente). **No revocar ni reescribir aprobaciones previas** por recalcular progreso.
12. Eliminar servicio/trabajo/elemento es **destructivo y explícito**, y puede borrar historial/fotos de ese ámbito. Fuera de este caso, las fotos históricas referenciadas se conservan.
13. Evidencia **compartida** entre técnicos asignados; registrar autoría de subidas, retiradas, envíos y revisiones, sin bloqueo exclusivo.
14. La cantidad de fotografías por requisito es ilimitada funcionalmente; existen límites de tamaño por archivo, tipo aceptado y almacenamiento.
15. La foto **no se mueve** entre requisitos ni a adicionales; se retira de evidencia vigente y vuelve a subir. Única excepción: al borrar un requisito antes del primer envío, sus fotos pasan a adicionales.
16. Un servicio sin trabajos no está completado. Un trabajo dividido sin elementos no está aprobado.
17. Usuarios desactivados pierden sesiones y acceso; su autoría histórica persiste. Nunca desactivar/quitar el rol al **último administrador activo**.
18. Bandeja de notificaciones persistente aunque Web Push falle; el fallo push no revierte envíos ni revisiones.

## Proceso de desarrollo exigido

- Crear primero esquema/migraciones, autorización central, validaciones y máquina de estados; implementar UI sobre operaciones ya protegidas.
- Todos los cambios críticos de evidencia deben usar **transacciones**, precondiciones sobre estado y **versión optimista** donde aplique; devolver `409 Conflict` si el cliente quedó desactualizado.
- No usar eliminación física inmediata de fotos referenciadas por entregas antiguas. Gestionar archivos con estados seguros y limpieza controlada.
- Validar con esquemas TypeScript de entrada (p. ej. Zod) **en servidor**, tamaños y tipos de archivo; no confiar en IDs, roles o nombres proporcionados por cliente.
- No mezclar paths de usuario con rutas del disco: IDs generados y rutas canonizadas fuera del directorio público.
- Toda mutación administrativa que destruye información debe presentar resumen de impacto y confirmación.
- Probar concurrencia y permisos, no solo el caso feliz. Agregar pruebas de regresión para cada incidente corregido.
- Implementar paginación y filtros en servidor en listados grandes. Nunca devolver toda la biblioteca de fotos al navegador por defecto.
- Generar ZIP con streaming o temporales acotados y borrar temporales después de uso; no cargar archivos masivos en RAM.
- Usar dependencias mantenidas y versiones compatibles entre SvelteKit/Svelte 5/shadcn-svelte/Drizzle/PWA; corroborar API real antes de incorporar paquetes.
- Añadir instrucciones reproducibles de desarrollo, migración, ejecución y recuperación de backups.

## Política de decisiones no especificadas

Usar la alternativa **más sencilla que respete el negocio**; registrar decisiones en documentación. No convertir opcionales en obligatorios. Para elecciones menores (íconos, microcopy, carpetas internas, umbrales configurables), seleccionar valores razonables y ajustables. Para cambios de alcance (p. ej. offline, firma, informes PDF de negocio, roles adicionales, cuotas funcionales, multi-tenant), **no asumir aprobación**. El PDF de evidencia por trabajo ya forma parte de la v1.

## Entregables mínimos de código (cuando se implemente)

- Aplicación SvelteKit y componentes responsivos accesibles.
- Modelo Drizzle, migraciones y semilla de desarrollo separada de datos reales.
- Autenticación, control de permisos y asistente de primer arranque.
- CRUD y reglas de catálogos/servicios/trabajos/elementos/requisitos/asignaciones.
- Carga, procesamiento, lectura y descarga autorizada de fotos; snapshots e historial.
- Revisión atómica, notificaciones internas y Web Push configurable.
- ZIP de entregas, servicios, trabajos y contratos, con registro XLSX y PDF de evidencia por trabajo.
- Dockerfile multi-stage, Compose, `.env.example`, healthchecks, guía de respaldo/restauración.
- Pruebas unitarias, integración de BD y flujos E2E críticos.

**Definición de terminado:** no basta que una pantalla funcione; debe cumplir autorización, integridad, historial, concurrencia, UX de error y pruebas indicadas en `docs/referencia/pruebas.md`.
