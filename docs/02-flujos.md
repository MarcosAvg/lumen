# 02 — Flujos de usuario, estados y situaciones límite

Las acciones críticas deben realizarse contra el servidor, nunca únicamente contra el estado del navegador. En todos los pasos, si la cuenta está inactiva o la asignación fue retirada, responder con acceso denegado y no exponer archivos.

## 1. Configuración inicial

1. Se despliega Lumen con contenedores y volúmenes; la migración prepara el esquema.
2. Si no existe administrador, se muestra **Configurar Lumen**. La petición de creación verifica de forma transaccional que todavía no se creó uno.
3. El usuario establece identificador/nombre visible y contraseña; nunca se suministran contraseñas predeterminadas permanentes.
4. Se crea administrador, sesión segura y fecha de alta. Si dos navegadores intentan configurarlo simultáneamente, **solo uno gana**.
5. Arranques posteriores muestran inicio de sesión habitual.

**Errores:** BD inaccesible → pantalla de indisponibilidad sin datos sensibles; credenciales inválidas → mensaje neutro; no permitir creación de otro admin mediante el asistente después del primer éxito.

## 2. Contratos, usuarios y asignaciones

1. Admin crea **contratos** (nombre y descripción). Todo servicio pertenece a un contrato.
2. Admin añade **participantes** al contrato (técnicos y supervisores). Un usuario puede estar en varios contratos.
3. Admin **o un supervisor del contrato** asignan servicios del contrato a sus participantes; los avisos se limitan al ámbito del contrato.
4. Asignar un servicio a quien no es participante del contrato: un **supervisor** recibe `409` ("añádelo al contrato primero"); un **administrador** lo incorpora al contrato automáticamente.
5. Mover un servicio a otro contrato **revoca** las asignaciones de sus usuarios que no pertenezcan al nuevo, con confirmación.
6. Revocar a alguien del contrato **revoca en cascada** sus asignaciones de servicio dentro del contrato: deja de verlos de inmediato.
7. Una desasignación revoca acceso al momento; las entregas o fotos del usuario mantienen su autoría.
8. Desactivar usuario invalida sesiones al momento de la siguiente petición y bloquea nuevas; puede volver a activarse.
9. Si cambia el rol global, mostrar asignaciones incompatibles (de contrato y de servicio) antes de confirmar, resolverlas en la misma transacción y conservar historial.
10. No dejar el sistema sin administrador activo.

**Ejemplo crítico:** supervisor S del contrato C intenta asignar el servicio de C a un técnico que pertenece al contrato D → `409`; el técnico no aparece como opción en el modal (solo se ofrecen participantes de C).

**Ejemplo crítico 2:** se revoca a un técnico del contrato → sus asignaciones de servicio en ese contrato quedan revocadas; la siguiente lectura o subida responde `404`/`403` aunque tuviera la galería abierta.

## 3. Construir catálogo y generar trabajos

1. Admin crea catálogos globales (p. ej. Edificios, Pisos, UMAs).
2. Crea ítems y opcionalmente asociaciones explícitas entre ítems de distintos catálogos.
3. Crea servicio, asigna edificio opcional y participantes.
4. Selecciona crear trabajo **manual** o **desde catálogo**. Puede generar repetidos mediante combinación elegida (p. ej. un trabajo por piso y cuatro elementos UMA por piso).
5. Antes de aplicar generación masiva, pantalla de vista previa con conteos, jerarquía, nombres, posibles duplicados y excepciones editables.
6. Confirmar crea trabajos/elementos en transacción; resultado usa vínculos a ítems, no copias estáticas salvo nombres personalizados.
7. Cambiar nombre en el catálogo actualiza etiquetas de objetos enlazados; cambiar nombre de solo uno **lo desvincula**.
8. Eliminar ítem global primero muestra usos; confirmación lo desvincula y copia su nombre en las instancias, sin tocar fotos ni revisiones.

**No asumir** que una UMA global solo puede existir una vez en un servicio: el contexto del trabajo determina la identidad de cada elemento. Evitar duplicados involuntarios mediante preview, sin bloquear casos válidos de nombres repetidos.

## 4. Crear trabajo directo

1. Admin crea un trabajo y elige `direct`.
2. Opcionalmente define requisitos como **Antes** (requerido), **Durante** (opcional), **Después** (requerido).
3. Asigna servicio a técnicos/supervisores.
4. Técnico abre `Servicio → Trabajo → Evidencia` sin pantalla de elemento intermedio.
5. Adjunta fotos en cada sección y/o Adicionales; verá miniaturas, progreso y autoría.
6. Reordena **dentro** de la sección, no entre secciones.
7. Al pulsar **Enviar evidencia**, se valida que cada requerido tenga ≥1 foto.
8. Se presenta confirmación con total de fotos y bloqueo posterior; si confirma y datos siguen vigentes, se crea entrega #1 y queda `in_review`.
9. Supervisor asignado ve la entrega en su cola, revisa todas las fotos y decide.

**Errores:** faltan fotos requeridas → especificar qué grupos faltan; carga en proceso → impedir envío; evidencia editada por tercero → `409`, refrescar y volver a confirmar.

## 5. Crear trabajo dividido

1. Admin crea trabajo `divided`, sin área de evidencia en el propio trabajo.
2. Crea elementos manualmente o desde catálogos (p. ej. UMA 01, UMA 02...).
3. Admin configura requisitos **por elemento** antes de su primer envío. Una opción de plantilla/copia inicial puede acelerar creación, pero los requisitos resultantes pertenecen a cada elemento.
4. Técnico abre `Servicio → Trabajo → Elemento → Evidencia` y captura.
5. Cada elemento tiene sus propias entregas y revisiones; los demás elementos no quedan bloqueados cuando uno está `in_review`.
6. Cuando **todos** los elementos están aprobados y hay al menos uno, el trabajo queda aprobado; de otro modo incompleto.
7. Añadir un elemento pendiente a un trabajo previamente aprobado recalcula estado del trabajo y servicio; los elementos anteriormente aprobados siguen bloqueados y conservan historial.

## 6. Subidas y trabajo simultáneo

**Caso A: subidas paralelas sin conflicto destructivo**

1. Técnicos Ana y Luis abren evidencia editable versión 12.
2. Ana añade imagen A y Luis añade imagen B; operaciones atómicas de append producen versiones 13 y 14. Ambas fotos permanecen.
3. No exigir bloqueo exclusivo; al refrescar ambos ven las fotos y sus autores.

**Caso B: reorder obsoleto**

1. Ana ve versión 14 y prepara nuevo orden.
2. Luis elimina otra foto, la versión llega a 15.
3. Ana confirma orden con versión 14: servidor responde `409`; UI muestra aviso y ofrece recargar antes de reintentar.

**Caso C: envío concurrente**

1. Ana confirma enviar versión 15.
2. Luis intenta quitar una foto simultáneamente.
3. Transacción serializa bloqueo/versionado: o la retirada ocurre antes y el envío desactualizado falla, o el envío ocurre antes y la retirada falla por bloqueo. Nunca llega una entrega inconsistente.

**Caso D: retiro de foto usada históricamente**

1. Entrega #1 se rechazó; técnico retira una foto del borrador vigente.
2. La foto ya no aparece en la evidencia actual, pero **sí** en Entrega #1 y sigue disponible para descarga histórica.
3. Una foto que nunca perteneció a una entrega puede limpiarse físicamente de manera segura mediante proceso de mantenimiento, conservando auditoría básica de retirada.

## 7. Revisión de entrega

1. Supervisor asignado ve bandeja interna y cola **Pendientes de revisión** para sus servicios; también puede abrir el enlace directo protegido.
2. Abre entrega y consulta fotos, grupos y orden tal como se enviaron.
3. Elige **Aprobar** o **Rechazar**; ambas acciones abren diálogo de confirmación.
4. En rechazo debe escribir motivo obligatorio (mensaje orientado a corrección).
5. En confirmación, servidor exige `in_review`, entrega correcta y permiso vigente; registra decisión y revisor en transacción.
6. Si aprobado, bloquea definitivamente objetivo; si rechazado, habilita corrección compartida y notifica técnicos activos asignados.
7. Si otro revisor ya decidió, mensaje de conflicto y actualización a la decisión existente, sin duplicados.

**Sin revisión parcial** por fotografía. No permitir editar el motivo ni aprobar después de rechazar esa misma entrega.

## 8. Corregir evidencia rechazada

1. Técnico entra a objetivo `rejected` y ve el motivo más reciente destacado.
2. Modifica la **evidencia actual**, retira y añade fotografías; puede reorganizar el orden por requisito.
3. No puede modificar nombre/obligatoriedad/orden de **requisitos** porque el primer envío los congeló.
4. En grupo equivocado: retirar foto de la evidencia y **volver a cargar** en otro grupo, sin operación de mover.
5. Confirma nuevo envío; el servidor crea Entrega #2 con nueva instantánea completa.
6. Supervisor revisa #2, mientras #1 sigue intacta en historial.

**Nota:** el rechazo no borra fotos ni reinicia la evidencia. Todos los técnicos autorizados pueden corregir independientemente de quién envió #1.

## 9. Navegar historial

1. Abrir una evidencia muestra por defecto pestaña **Actual**.
2. Seleccionar **Historial** muestra entregas en orden descendente (#3, #2, #1...).
3. Abrir una entrega ofrece galería de solo lectura, autor/fecha de envío, estado de revisión, revisor/fecha y motivo de rechazo si existe.
4. Permite descargar una foto o ZIP de **esa entrega**, sin usar el borrador vigente.
5. No hay controles de quitar/mover foto ni acciones de revisión si esa entrega ya fue revisada.

## 10. Editar estructura y aprobar parcialmente

**Añadir/quitar elemento en trabajo aprobado:** admin confirma; el avance se recalcula. Añadir crea elemento pendiente, sin tocar otros aprobados. Borrar muestra cantidad de fotos y entregas afectadas.

**Editar requisitos:** permitido si el objetivo jamás se envió. Al borrar un requisito, pasar sus fotos a Adicionales y actualizar versión/orden transaccionalmente. Si ya hubo envío, bloquear aunque esté rechazado.

**Cambiar modo de trabajo:** admin inicia asistente; servidor verifica que ningún objetivo del trabajo tenga envíos en toda su vida. La UI obliga a reasignar **todas** las fotos y requisitos a los destinos definidos. Confirmación atómica o cancelación sin cambios. Si apareció un envío entre preview y confirmación, rechazar conversión.

**Borrado destructivo:** mostrar objeto, total de trabajos/elementos, fotos e historial impactados, requerir acción explícita. No confundir con la eliminación de ítem de catálogo, que **solo desvincula** objetos reutilizadores.

## 11. Exportaciones

### Fotografía individual

1. Usuario autorizado abre foto de evidencia actual o histórica.
2. Descarga pasa por endpoint autenticado que devuelve archivo optimizado, no URL del volumen.

### ZIP de entrega

1. Desde entrega específica, usuario elige **Descargar ZIP**.
2. Servidor reconstruye **solo** la lista `submission_photos` de esa entrega, no galería actual.
3. Produce carpetas según requisitos guardados al enviar, más Adicionales; fotos con prefijos numéricos que respetan orden.
4. Si la entrega carece de algunas secciones opcionales, puede omitir carpetas vacías.

### ZIP de contrato

1. Desde la ficha del contrato, admin o **supervisor del contrato** pulsa **Exportar ZIP** (los técnicos no exportan).
2. La jerarquía es `Contrato ▸ Edificio ▸ Servicio ▸ Trabajo ▸ (Elemento) ▸ Requisito ▸ fotos`; solo aparecen carpetas de edificios con servicios en el contrato y los servicios sin edificio van a «Sin edificio».
3. Solo se incluye la **última entrega aprobada** de cada objetivo.

### ZIP de trabajo

1. Desde la ficha del trabajo, admin o supervisor asignado pulsa **Exportar ZIP**.
2. Jerarquía `Trabajo ▸ (Elemento) ▸ Requisito ▸ fotos`, mismo criterio de solo aprobados.

### ZIP de servicio

1. Desde servicio, usuario (admin o supervisor asignado) pulsa **Exportar ZIP**.
2. Jerarquía `Servicio ▸ Trabajo ▸ (Elemento) ▸ Requisito ▸ fotos`; solo la **última entrega aprobada** de cada objetivo.
3. Transmite ZIP o prepara temporal acotado; limpia recursos aun si el navegador interrumpe.

### Registro XLSX (incluido en cada ZIP)

1. Cada ZIP (contrato, servicio o trabajo) puede incluir un libro `<Ámbito>/<Ámbito>.xlsx` en su raíz (opcional desde el modal).
2. Dos **variantes**:
   - **Simple**: solo hojas por servicio con `Edificio · Trabajo · Estado · Evidencia · Notas` (sin hoja `Resumen`).
   - **Extendida**: hoja `Resumen` (por servicio: trabajos, aprobados, en revisión, rechazados, pendientes y % de avance) + una hoja por servicio con todas las columnas (tipo, elementos, requisitos, fotografías, última entrega, decisión, revisor, fecha y motivo de rechazo).
3. En ambas, **una fila por trabajo** y columna **Evidencia** con **hipervínculo relativo** al PDF del trabajo (que vivirá en su carpeta).
4. Se incluye **todo el estado** (pendientes y rechazados también); las **fotos del ZIP siguen siendo solo las aprobadas**.

### Opciones de exportación

El modal permite además **incluir o no** el registro XLSX y **incluir o no** las carpetas de fotografías (al menos una de las dos).

### Exportación de datos

Retirada por ahora como CSV; el registro de datos se entrega en **XLSX** dentro de cada ZIP.

## 12. Búsqueda global

1. Usuario escribe término en buscador accesible desde navegación principal.
2. Servidor busca por nombre visible actual de servicios, trabajos y elementos, en catálogos vinculados y nombres personalizados.
3. Resultados incluyen **tipo** y **ruta contextual**: «UMA 03 · Servicio Mantenimiento / Piso 34».
4. Si no está asignado al servicio, no se devuelve ningún registro ni total que lo revele.
5. Al seleccionar, navega al destino autorizado; si se revocó acceso entre búsqueda y clic, se muestra acceso denegado.
6. Filtrar, paginar y limitar resultados; la búsqueda global no sustituye filtros locales de estado.

## 13. Notificaciones internas y push

1. Después de persistir una entrega, se crean notificaciones internas para supervisores activos asignados y se intenta push tras confirmar transacción.
2. Después de la decisión, se crean notificaciones internas para técnicos activos asignados y se intenta push.
3. El icono de campana muestra no leídas. Bandeja permite abrir, marcar una o todas leídas.
4. Push abre ruta profunda a recurso con control de permisos en servidor.
5. Si el navegador deniega permiso push, no está instalado como PWA en iOS o el servicio push falla, **la bandeja interna sigue funcionando** y el usuario puede operar normalmente.
6. Reintentar entrega push de manera limitada si se desea, pero no duplicar notificaciones internas del mismo evento/destinatario.

## 14. Casos de prueba narrativos obligatorios

- Crear un trabajo directo y aprobar su única entrega → trabajo y servicio completados cuando es el único trabajo.
- Trabajo dividido vacío → nunca aprobado; añadir elemento y aprobarlo → aprobado.
- Añadir elemento pendiente a trabajo dividido aprobado → servicio incompleto, aprobaciones anteriores intactas.
- Entrega rechazada, corregir y reenviar → dos snapshots diferentes; motivo #1 persiste y fotos históricas siguen accesibles.
- Supervisor no asignado intenta abrir URL y descarga → `403` o `404` opaco; no filtrar fotos.
- Desactivar técnico con sesión abierta → nuevas peticiones denegadas, autoría intacta.
- Renombrar ítem de catálogo → afecta solo registros vinculados; renombrar trabajo individual desvincula.
- Eliminar ítem de catálogo → nombre preservado en instancias, ninguna foto perdida.
- Dos técnicos compiten por ordenar y enviar → una operación gana, la otra responde conflicto, snapshot consistente.
- Dos supervisores revisan misma entrega → solo una revisión aceptada.
- Exportar ZIP de servicio incompleto → solo aprobados + `resumen.csv` de pendientes.
- No permitir editar requisitos tras primer envío, aunque actualmente rechazado.
- Intentar enviar sin requeridos o con foto sin terminar de procesar → error; no crear entrega parcial.
