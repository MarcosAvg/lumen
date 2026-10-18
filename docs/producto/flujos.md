# Flujos de usuario y situaciones límite

> **Audiencia:** producto, soporte y desarrollo.
> **Estado:** vigente.
> **Fuente canónica de:** comportamiento observable de cada operación.

Las acciones críticas se ejecutan contra el servidor, nunca solo contra el
estado del navegador. Si la cuenta está inactiva o la asignación fue retirada,
la respuesta es acceso denegado y los archivos no se exponen.

## 1. Configuración inicial

1. Se despliega Lumen con contenedores y volúmenes; la migración prepara el
   esquema.
2. Si no existe administrador, se muestra **Configurar Lumen**.
3. La creación verifica de forma transaccional que todavía no hay otro
   administrador.
4. El usuario define identificador, nombre visible y contraseña. No hay
   contraseñas predeterminadas permanentes.
5. Se crea la cuenta, la sesión y la fecha de alta. Si dos navegadores compiten,
   solo uno gana.
6. Los arranques posteriores muestran el login habitual.

**Errores:** base inaccesible → pantalla de indisponibilidad sin datos
sensibles; credenciales inválidas → mensaje neutro; el asistente deja de crear
administradores después del primer éxito.

## 2. Contratos, usuarios y asignaciones

1. El administrador crea contratos con nombre y descripción.
2. Añade participantes al contrato como técnicos o supervisores. Un usuario
   puede pertenecer a varios contratos.
3. El administrador o un supervisor del contrato asignan servicios del contrato
   a sus participantes.
4. Asignar un servicio a quien no es participante:
   - el supervisor recibe `409` y debe añadirlo al contrato primero;
   - el administrador incorpora al usuario al contrato automáticamente.
5. Mover un servicio a otro contrato revoca las asignaciones incompatibles, con
   confirmación.
6. Revocar a alguien del contrato revoca en cascada sus asignaciones de
   servicio dentro del contrato.
7. Una desasignación revoca el acceso de inmediato; la autoría histórica se
   conserva.
8. Desactivar un usuario invalida sus sesiones y bloquea nuevos accesos. Puede
   reactivarse.
9. Al cambiar el rol global se muestran las asignaciones incompatibles, se
   resuelven en la misma transacción y se conserva el historial.
10. No se puede dejar el sistema sin administrador activo.

**Ejemplo:** el supervisor S del contrato C intenta asignar un servicio de C a un
técnico del contrato D. Recibe `409`; el técnico ni siquiera aparece como opción
en el modal.

**Ejemplo:** se revoca a un técnico del contrato. Sus asignaciones de servicio en
ese contrato quedan revocadas y la siguiente lectura o subida responde
`404`/`403`, aunque tuviera la galería abierta.

### Ciclo de vida de contratos y servicios

1. Los contratos y servicios existentes se migran como `active`.
2. Un servicio puede crearse `planned` marcando «Crear en espera». En ese estado
   se puede preparar la estructura, pero toda captura, envío o revisión responde
   `409`.
3. `planned → active` exige un contrato activo. `active → inactive` pausa la
   captura y la revisión sin borrar nada. `inactive → active` reanuda si el
   contrato sigue activo.
4. `active|inactive → archived` exige que el servicio esté completado. El
   archivado es terminal y deja el servicio en solo lectura.
5. Un contrato solo pasa a `inactive` si no tiene servicios `active` o
   `planned`. Solo pasa a `archived` cuando todos sus servicios están
   archivados. El archivado del contrato es terminal.
6. Las listas de contratos y servicios muestran por defecto el estado activo y
   permiten consultar los demás estados. El tablero solo agrega servicios
   activos.
7. Archivar nunca reescribe aprobaciones, entregas, fotos ni autoría. Si un
   administrador añade estructura después de una aprobación, el avance se
   recalcula según las reglas existentes.

## 3. Catálogos y generación de estructura

1. El administrador crea catálogos globales con propósito general, edificios o
   requisitos.
2. Crea ítems y, opcionalmente, relaciones entre ítems de catálogos distintos.
3. Crea el servicio, asigna edificio opcional y participantes.
4. Elige crear trabajo manual o desde catálogo. Puede generar varios trabajos y
   elementos a la vez.
5. Antes de aplicar la generación se muestra una vista previa con conteos,
   jerarquía, nombres, duplicados y excepciones editables.
6. Confirmar crea la estructura en una transacción. Los nombres quedan
   vinculados al catálogo salvo que se personalicen.
7. Cambiar el nombre de un ítem actualiza las instancias vinculadas. Cambiar el
   nombre de una sola instancia la desvincula.
8. Eliminar un ítem muestra sus usos, copia el último nombre a las instancias,
   las desvincula y no toca fotos ni revisiones.

**No asumir** que un ítem global solo puede existir una vez en un servicio. El
contexto del trabajo determina la identidad de cada elemento. La vista previa
evita duplicados involuntarios sin bloquear nombres repetidos válidos.

## 4. Crear un trabajo directo

1. El administrador crea un trabajo y elige `direct`.
2. Opcionalmente define requisitos como Antes, Durante y Después.
3. Asigna técnicos y supervisores al servicio.
4. El técnico abre `Servicio → Trabajo → Evidencia` sin pantalla de elemento.
5. Adjunta fotos en cada sección o en Adicionales; ve miniaturas, progreso y
   autoría.
6. Reordena dentro de la sección, no entre secciones.
7. Al pulsar **Enviar evidencia**, el servidor valida los requisitos
   obligatorios.
8. Se muestra la confirmación con el total de fotos y el bloqueo posterior. Si
   los datos siguen vigentes, se crea la entrega #1 y el objetivo pasa a
   `in_review`.
9. El supervisor asignado ve la entrega en su cola, revisa las fotos y decide.

**Errores:** faltan fotos requeridas → se indican los grupos; carga en proceso →
se impide el envío; evidencia editada por otro → `409`, recargar y confirmar.

## 5. Crear un trabajo dividido

1. El administrador crea un trabajo `divided`, sin evidencia en el padre.
2. Crea elementos manualmente o desde catálogos.
3. Configura requisitos por elemento antes de su primer envío. Una plantilla o
   copia inicial puede acelerar la creación, pero los requisitos pertenecen a
   cada elemento.
4. El técnico abre `Servicio → Trabajo → Elemento → Evidencia`.
5. Cada elemento tiene sus propias entregas y revisiones. Los demás elementos no
   se bloquean cuando uno está en revisión.
6. Cuando todos los elementos están aprobados y hay al menos uno, el trabajo
   queda aprobado.
7. Añadir un elemento pendiente a un trabajo aprobado recalcula el estado; los
   elementos aprobados siguen bloqueados y conservan historial.

## 6. Subidas y trabajo simultáneo

### Subidas paralelas

1. Ana y Luis abren la misma evidencia editable en versión 12.
2. Ana añade la foto A y Luis la foto B. Las operaciones de append producen las
   versiones 13 y 14.
3. Ambas fotos permanecen. No hay bloqueo exclusivo.
4. Al refrescar, ambos ven las fotos y sus autores.

### Reordenación obsoleta

1. Ana ve la versión 14 y prepara un orden nuevo.
2. Luis elimina otra foto y la versión llega a 15.
3. Ana confirma con versión 14: el servidor responde `409`.
4. La UI avisa y ofrece recargar antes de reintentar.

### Envío concurrente

1. Ana confirma enviar la versión 15.
2. Luis intenta retirar una foto a la vez.
3. La transacción serializa el bloqueo: o la retirada ocurre antes y el envío
   desactualizado falla, o el envío ocurre antes y la retirada falla por
   bloqueo. Nunca se crea una entrega inconsistente.

### Retiro de una foto histórica

1. La entrega #1 se rechazó y el técnico retira una foto del borrador vigente.
2. La foto desaparece de la evidencia actual, pero sigue en la entrega #1 y se
   puede descargar.
3. Una foto que nunca perteneció a una entrega puede limpiarse con el proceso de
   mantenimiento, conservando la auditoría básica de retirada.

## 7. Revisión de una entrega

1. El supervisor asignado ve la bandeja y la cola **Pendientes de revisión** de
   sus servicios, o abre un enlace directo protegido.
2. Abre la entrega y consulta fotos, grupos y orden tal como se enviaron.
3. Elige **Aprobar** o **Rechazar**. Ambas acciones abren confirmación.
4. En el rechazo escribe un motivo obligatorio orientado a la corrección.
5. El servidor exige `in_review`, entrega correcta y permiso vigente; registra
   decisión y revisor en una transacción.
6. Aprobar bloquea el objetivo. Rechazar habilita la corrección compartida y
   notifica a los técnicos activos asignados.
7. Si otro revisor ya decidió, se muestra conflicto y la decisión existente, sin
   duplicados.

No existe revisión parcial por fotografía. No se edita el motivo ni se aprueba
después de rechazar esa misma entrega.

## 8. Corregir evidencia rechazada

1. El técnico entra al objetivo `rejected` y ve el motivo más reciente.
2. Modifica la evidencia actual: retira, añade o reordena fotos.
3. No puede cambiar nombres, obligatoriedad ni orden de requisitos porque el
   primer envío los congeló.
4. Si una foto está en el grupo equivocado, la retira y la vuelve a subir en el
   grupo correcto. No existe operación de mover.
5. Confirma un nuevo envío; se crea la entrega #2 con una instantánea completa.
6. El supervisor revisa #2 mientras #1 sigue intacta en el historial.

El rechazo no borra fotos ni reinicia la evidencia. Cualquier técnico autorizado
puede corregir, independientemente de quién envió #1.

## 9. Consultar el historial

1. Abrir una evidencia muestra por defecto **Actual**.
2. **Historial** muestra las entregas de la más reciente a la más antigua.
3. Abrir una entrega ofrece galería de solo lectura, autor y fecha de envío,
   estado de revisión, revisor y fecha, y motivo de rechazo.
4. Permite descargar una foto o el ZIP de esa entrega si el rol lo permite. Los
   técnicos descargan fotos, no ZIP.
5. No hay controles de edición ni acciones de revisión sobre una entrega ya
   revisada.

## 10. Cambios estructurales y borrado

- **Añadir o quitar elemento en un trabajo aprobado:** el administrador
  confirma; el avance se recalcula. Añadir crea un elemento pendiente; borrar
  muestra fotos y entregas afectadas.
- **Editar requisitos:** solo si el objetivo nunca se envió. Al borrar un
  requisito, sus fotos pasan a Adicionales y se actualiza la versión en una
  transacción.
- **Cambiar el modo de trabajo:** el administrador inicia el asistente. El
  servidor verifica que ningún objetivo del trabajo tenga envíos en toda su
  vida. La UI obliga a reasignar todas las fotos y requisitos. La confirmación
  es atómica o no hay cambios.
- **Borrado destructivo:** muestra objeto, trabajos/elementos, fotos e historial
  afectados y exige confirmación explícita. No se confunde con eliminar un ítem
  de catálogo, que solo desvincula.

## 11. Exportaciones

- **Fotografía individual:** usuario autorizado abre la foto actual o histórica.
  El endpoint autenticado devuelve el archivo optimizado; nunca la ruta del
  volumen.
- **ZIP de entrega:** reconstruye solo las fotos de esa entrega, con sus grupos
  y orden. Disponible para administradores y supervisores, no para técnicos.
- **ZIP de contrato, servicio o trabajo:** incluye solo la última entrega
  aprobada de cada objetivo. Puede incluir registro XLSX y PDF de evidencia
  según las opciones del modal.
- La jerarquía, las variantes y los formatos están en
  [`referencia/exportaciones.md`](../referencia/exportaciones.md).

## 12. Búsqueda global

1. El usuario escribe un término en el buscador de la navegación.
2. El servidor busca por nombre visible actual de servicios, trabajos y
   elementos, incluidos catálogos vinculados y nombres personalizados.
3. Los resultados incluyen tipo y ruta contextual.
4. Si el usuario no está asignado al servicio, no se devuelve ningún registro ni
   un total que lo revele.
5. Al seleccionar, navega al destino autorizado. Si el acceso se revocó entre la
   búsqueda y el clic, se muestra acceso denegado.
6. La búsqueda se filtra, pagina y limita en servidor. Los filtros locales no
   sustituyen la búsqueda global.

## 13. Notificaciones internas y push

1. Después de persistir una entrega se crean notificaciones para supervisores
   activos asignados y administradores activos, excepto quien envía.
2. Después de una decisión se crean notificaciones para técnicos activos
   asignados y administradores activos, excepto quien revisa.
3. La campana muestra las no leídas. La bandeja permite abrir y marcar una o
   todas como leídas.
4. El push abre una ruta profunda con control de permisos en servidor.
5. Si el navegador deniega el permiso, no está instalado en iOS o el push falla,
   la bandeja interna sigue funcionando.
6. Los reintentos de push no duplican notificaciones internas del mismo evento y
   destinatario.
