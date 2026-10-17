# Documentación de Lumen

Índice de la especificación y la operación. Los documentos numerados son la
**especificación** del producto; `deployment.md` cubre la **operación**;
`IMPLEMENTATION_STATUS.md` es el registro de avance.

## Orden de lectura (especificación)

| # | Documento                                        | Propósito                                                     |
| - | ------------------------------------------------ | ------------------------------------------------------------ |
| 1 | [`01-producto.md`](01-producto.md)               | Modelo funcional, roles, reglas de negocio e invariantes     |
| 2 | [`02-flujos.md`](02-flujos.md)                   | Flujos paso a paso y situaciones límite                      |
| 3 | [`03-modelo-datos.md`](03-modelo-datos.md)       | Esquema relacional, integridad y transacciones               |
| 4 | [`04-arquitectura.md`](04-arquitectura.md)       | Componentes, seguridad, archivos, PWA, Docker y API          |
| 5 | [`05-interfaz-pwa.md`](05-interfaz-pwa.md)       | Pantallas, navegación, interacciones y accesibilidad         |
| 6 | [`06-implementacion.md`](06-implementacion.md)   | Etapas, matriz de pruebas y criterios de aceptación          |

## Operación y estado

| Documento                                                            | Propósito                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`deployment.md`](deployment.md)                                     | Referencia operativa **canónica**: Cloudflare Tunnel, variables, actualización, backup y problemas |
| [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md)          | Registro de avance por etapas, decisiones y pruebas                                    |
| [`../research/README.md`](../research/README.md)                      | Plan y guion de investigación de UX (interno)                                          |

## Otros

- [`../README.md`](../README.md) — presentación del proyecto y arranque rápido.
- [`../AGENTS.md`](../AGENTS.md) — reglas de trabajo para el agente de programación.
