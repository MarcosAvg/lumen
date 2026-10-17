# Documentación de Lumen

Documentación interna del producto, la operación y el desarrollo. Cada tema
tiene un documento canónico; el resto de páginas enlazan a él en lugar de
repetir su contenido.

## Empieza aquí

| Si eres… | Empieza por |
|---|---|
| Operador o administrador del servidor | [`guias/instalacion.md`](guias/instalacion.md) y [`guias/operacion.md`](guias/operacion.md) |
| Técnico | [`guias/tecnico.md`](guias/tecnico.md) |
| Supervisor | [`guias/supervisor.md`](guias/supervisor.md) |
| Administrador funcional | [`guias/administrador.md`](guias/administrador.md) |
| Nuevo en el producto | [`producto/reglas.md`](producto/reglas.md) y [`producto/glosario.md`](producto/glosario.md) |
| Desarrollador | [`desarrollo/setup.md`](desarrollo/setup.md) y [`referencia/arquitectura.md`](referencia/arquitectura.md) |
| Buscas un dato técnico | [Mapa canónico](#mapa-canónico) |

## Mapa canónico

| Tema | Documento | Contenido |
|---|---|---|
| Reglas de negocio | [`producto/reglas.md`](producto/reglas.md) | Alcance, roles, permisos, invariantes y estados |
| Flujos y errores | [`producto/flujos.md`](producto/flujos.md) | Comportamiento observable y situaciones límite |
| Experiencia de uso | [`producto/experiencia.md`](producto/experiencia.md) | Pantallas, navegación, estados, accesibilidad y copy |
| Glosario | [`producto/glosario.md`](producto/glosario.md) | Términos del dominio y convenciones de lenguaje |
| Instalación | [`guias/instalacion.md`](guias/instalacion.md) | Requisitos, Compose, Cloudflare Tunnel y primer arranque |
| Operación | [`guias/operacion.md`](guias/operacion.md) | Actualización, respaldo, restauración, mantenimiento y problemas |
| Guía del técnico | [`guias/tecnico.md`](guias/tecnico.md) | Captura, corrección, envío e historial |
| Guía del supervisor | [`guias/supervisor.md`](guias/supervisor.md) | Cola de revisión, aprobación, rechazo y descargas |
| Guía del administrador | [`guias/administrador.md`](guias/administrador.md) | Contratos, usuarios, catálogos, servicios y estructura |
| Modelo de datos | [`referencia/modelo-datos.md`](referencia/modelo-datos.md) | Tablas, restricciones, transacciones y agregados |
| Arquitectura | [`referencia/arquitectura.md`](referencia/arquitectura.md) | Componentes, seguridad, almacenamiento y PWA |
| API | [`referencia/api.md`](referencia/api.md) | Endpoints, permisos y errores |
| Exportaciones | [`referencia/exportaciones.md`](referencia/exportaciones.md) | ZIP, XLSX y PDF: jerarquías, opciones y roles |
| Variables de entorno | [`referencia/variables-entorno.md`](referencia/variables-entorno.md) | `.env`, variables fijas de Compose y valores por defecto |
| Pruebas | [`referencia/pruebas.md`](referencia/pruebas.md) | Matriz de pruebas y criterios de aceptación |
| Desarrollo | [`desarrollo/setup.md`](desarrollo/setup.md) | Entorno local, migraciones, scripts y pruebas |
| Sistema de UI | [`desarrollo/sistema-ui.md`](desarrollo/sistema-ui.md) | Tokens, componentes, breakpoints y patrones de implementación |
| Plan histórico | [`archivo/plan-v1.md`](archivo/plan-v1.md) | Plan de la v1, conservado como referencia no normativa |
| Estado actual | [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) | Avance, decisiones y pruebas de la implementación |
| Investigación UX | [`../research/README.md`](../research/README.md) | Plan y guion de investigación interno |

## Documentos anteriores

Los documentos numerados de la etapa inicial se reorganizaron. Esta tabla
conserva la correspondencia para enlaces antiguos:

| Antes | Ahora |
|---|---|
| `docs/01-producto.md` | [`producto/reglas.md`](producto/reglas.md) |
| `docs/02-flujos.md` | [`producto/flujos.md`](producto/flujos.md) |
| `docs/03-modelo-datos.md` | [`referencia/modelo-datos.md`](referencia/modelo-datos.md) |
| `docs/04-arquitectura.md` | [`referencia/arquitectura.md`](referencia/arquitectura.md), [`referencia/api.md`](referencia/api.md) y [`referencia/variables-entorno.md`](referencia/variables-entorno.md) |
| `docs/05-interfaz-pwa.md` | [`producto/experiencia.md`](producto/experiencia.md) y [`desarrollo/sistema-ui.md`](desarrollo/sistema-ui.md) |
| `docs/06-implementacion.md` | [`referencia/pruebas.md`](referencia/pruebas.md) y [`archivo/plan-v1.md`](archivo/plan-v1.md) |
| `docs/deployment.md` | [`guias/instalacion.md`](guias/instalacion.md), [`guias/operacion.md`](guias/operacion.md) y [`referencia/variables-entorno.md`](referencia/variables-entorno.md) |

## Cómo se mantiene

- **Una fuente por tema.** Si una regla cambia, se actualiza su documento
  canónico y se revisan los enlaces, no se copia en varios sitios.
- **Referencia frente a guía.** La referencia describe el sistema; las guías
  explican cómo hacer una tarea. No mezclar ambas voces en el mismo documento.
- **Vocabulario.** En prosa se usa «objetivo», «entrega», «revisión» y
  «requisito» según el [`glosario`](producto/glosario.md). Los nombres técnicos
  (`target`, `submission`, `review`) se reservan para tablas y código.
- **Enlaces relativos.** Todos los enlaces deben resolverse dentro del
  repositorio. Antes de cerrar un cambio, comprobar que no quedan rutas
  antiguas.
- **Estado y archivo.** El estado vigente está en `IMPLEMENTATION_STATUS.md`.
  Los planes cumplidos se conservan en `archivo/` y no son normativos.
- **Reglas de trabajo.** Las instrucciones para agentes y colaboradores están
  en [`../AGENTS.md`](../AGENTS.md).
