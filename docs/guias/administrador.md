# Guía del administrador

> **Audiencia:** administradores funcionales.
> **Estado:** vigente.

## 1. Orden recomendado de configuración

1. Crear contratos.
2. Crear usuarios y asignarles un rol global.
3. Añadir participantes al contrato.
4. Crear catálogos e ítems si se van a reutilizar nombres.
5. Crear servicios y asignar participantes.
6. Crear trabajos, elementos y requisitos.
7. Revisar la estructura con la vista previa antes de generar en lote.

## 2. Usuarios

- Solo un administrador crea cuentas.
- El primer arranque crea la primera cuenta administradora.
- Se puede editar nombre visible y nombre de usuario.
- Desactivar invalida sesiones y bloquea el acceso; la autoría histórica se
  conserva.
- No se puede desactivar, eliminar ni degradar al **último administrador
  activo**.
- Al cambiar el rol global hay que previsualizar y resolver las asignaciones
  incompatibles.
- Eliminar una cuenta borra el registro y sus asignaciones, pero conserva la
  firma histórica en entregas, fotos, revisiones y auditoría.

## 3. Contratos

- Un contrato agrupa servicios y participantes.
- Tiene nombre único, descripción opcional y configuración de PDF de evidencia.
- Añadir o revocar participantes se hace en modal.
- Revocar a alguien del contrato revoca sus asignaciones de servicio dentro del
  contrato.
- No se puede borrar un contrato con servicios; primero hay que moverlos o
  eliminarlos.
- El fondo del PDF se sube como PNG/JPG de máximo 5 MB; los márgenes se ajustan
  entre 10 y 80 mm.

## 4. Catálogos

Propósitos:

- **General:** trabajos y elementos.
- **Edificios:** edificio del servicio.
- **Requisitos:** requisitos fotográficos.

Buenas prácticas:

- Usa un catálogo por propósito; los selectores solo muestran el tipo que
  corresponde.
- Evita duplicados de nombre dentro del mismo catálogo.
- Las relaciones entre catálogos son opcionales y tienen sentido explícito.
- Renombrar un ítem actualiza las instancias vinculadas.
- Renombrar una instancia concreta la desvincula.
- Borrar un ítem copia el último nombre a las instancias y no borra evidencias.

## 5. Servicios y participantes

- Todo servicio pertenece a un contrato.
- El edificio es opcional y puede ser un ítem de catálogo.
- Al cambiar un servicio de contrato se revocan las asignaciones incompatibles,
  con confirmación.
- Un administrador puede incorporar al usuario al contrato al asignarle un
  servicio.
- Un supervisor del contrato solo puede asignar a miembros existentes.
- Los técnicos no asignan.
- Añadir o quitar trabajos recalcula el avance; no reescribe aprobaciones
  anteriores.

## 6. Trabajos, elementos y requisitos

- Un trabajo es **directo** o **dividido**.
- Un trabajo dividido necesita al menos un elemento para poder aprobarse.
- Se pueden crear trabajos y elementos manualmente o desde catálogo con vista
  previa.
- Al crear un trabajo o añadir elementos se pueden elegir requisitos de catálogo
  o libres; se aplican al objetivo o a cada elemento, omitiendo duplicados.
- Los requisitos se pueden editar solo antes del primer envío del objetivo.
  Después quedan congelados aunque la entrega se rechace.
- Al borrar un requisito antes del primer envío, sus fotos pasan a Adicionales.
- Cambiar `direct` ↔ `divided` solo es posible si el trabajo nunca tuvo una
  entrega. El asistente exige reasignar todas las fotos y requisitos.
- Borrar servicio, trabajo o elemento es destructivo: muestra impacto y exige
  confirmación explícita.

## 7. Revisión y exportación

- Como administrador puedes revisar entregas de cualquier servicio.
- Puedes capturar y enviar evidencia.
- Puedes descargar fotos y ZIP de entrega, servicio, trabajo o contrato.
- Los ZIP de ámbito incluyen solo la última entrega aprobada de cada objetivo.
- El modal de exportación permite elegir variante XLSX e incluir o no XLSX,
  fotografías y PDF de evidencia.
- El detalle de formatos está en
  [`../referencia/exportaciones.md`](../referencia/exportaciones.md).

## 8. Operación y seguridad

- Revisa que PostgreSQL y el volumen de fotos estén respaldados juntos.
- Mantén actualizada la imagen y revisa logs y `/health`.
- No compartas la clave privada VAPID.
- No desactives CSRF ni la verificación de `Origin`.
- No publiques PostgreSQL ni puertos de la app en el host.
- Antes de un borrado destructivo, revisa el resumen de impacto y prueba el
  respaldo.

Las reglas completas están en [`../producto/reglas.md`](../producto/reglas.md).
La instalación y operación, en
[`instalacion.md`](instalacion.md) y [`operacion.md`](operacion.md).
