# 01 — Producto, alcance y reglas de negocio

## 1. Visión y lenguaje del dominio

**Lumen** registra evidencia fotográfica del trabajo realizado y controla su revisión. No intenta administrar órdenes de compra, inventario físico, facturación o mantenimiento predictivo; el **contrato** es solo la agrupación de servicios y participantes (sin datos legales/comerciales). Se dirige a **decenas de usuarios internos** en una instancia autohospedada.

- **Contrato:** nivel jerárquico superior; agrupa varios servicios y define **qué técnicos y supervisores participan** en ellos. Un usuario puede pertenecer a varios contratos. Quien no es miembro no ve nada del contrato (`404` opaco).
- **Servicio:** unidad contenedora; pertenece **siempre a un contrato** y tiene nombre, descripción opcional, edificio opcional, técnicos y supervisores asignados, y una colección de trabajos. Su avance es **derivado**.
- **Trabajo:** actividad o unidad organizada bajo un servicio; posee nombre, descripción opcional y un modo excluyente: `direct` o `divided`.
- **Elemento:** subunidad de un trabajo `divided` (p. ej. UMA 01). Cada elemento tiene evidencia y revisiones propias.
- **Unidad de evidencia / objetivo (`target`):** un trabajo `direct` **o** un elemento de trabajo `divided`. Requisitos, fotografías, entregas, revisión y estado se administran por objetivo.
- **Requisito fotográfico:** grupo con nombre, posición y marca obligatorio/opcional. No es una tarea a aprobar individualmente.
- **Foto adicional:** foto permitida sin requisito asociado; nunca requiere que el admin cree un requisito artificial.
- **Evidencia vigente:** colección editable de fotos y orden actuales del objetivo (o de solo lectura si enviado/aprobado).
- **Entrega (`submission`):** instantánea inmutable de la evidencia en un momento determinado.
- **Revisión (`review`):** decisión de aprobar o rechazar una entrega, con motivo obligatorio para rechazos.
- **Catálogo e ítem:** listas reutilizables y opcionales para nombrar e identificar edificios, pisos, equipos o cualquier categoría administrada; también admiten relaciones entre ítems.

## 2. Roles y autorización

| Capacidad | Admin | Supervisor asignado | Técnico asignado |
|---|:---:|:---:|:---:|
| Consultar servicio, trabajo, elementos y participantes | Sí, todos | Sí | Sí |
| Buscar globalmente dentro de ámbito autorizado | Sí | Sí | Sí |
| Administrar usuarios, roles y activación | Sí | No | No |
| Administrar catálogos, ítems y relaciones | Sí | No | No |
| Crear/editar/borrar servicios, trabajos, elementos y requisitos | Sí | No | No |
| Asignar técnicos/supervisores | Sí | No | No |
| Subir, quitar, reordenar fotos de evidencia vigente | Sí | No | Sí |
| Enviar entrega de evidencia | Sí | No | Sí |
| Consultar fotos, estado, historial y revisiones | Sí | Sí | Sí |
| Aprobar o rechazar entregas | Sí | Sí | No |
| Descargar foto individual | Sí | Sí | Sí |
| Descargar entrega ZIP / servicio ZIP | Sí | Sí | No |
| Exportar CSV administrativo | Sí | No | No |

Un usuario debe estar **activo** y disponer de sesión válida para cualquier operación. Los administradores tienen permiso global sin necesitar asignación. Los supervisores y técnicos acceden **solo a los servicios activos en su asignación y cuyo contrato sigue contando con ellos como miembros activos** (salir del contrato retira el acceso, aunque la asignación de servicio siguiera marcada). Los **participantes de un contrato** (técnicos y supervisores) son la única población asignable a sus servicios; los administradores pueden asignar e **incorporan al usuario al contrato** si no lo estaba, mientras que un **supervisor del contrato** solo puede asignar servicios del suyo a miembros existentes. La vista de participantes expone nombre visible y rol pertinente, nunca credenciales ni datos sensibles. Los **técnicos no exportan ZIP** (capturan y envían evidencia); las descargas de ZIP de entrega y de servicio quedan para administradores y supervisores asignados.

### Usuarios

- Primer inicio: un asistente configura la **primera cuenta administradora** de forma atómica. Después solo administradores crean cuentas.
- Autenticación local con nombre de usuario o identificador único configurado y contraseña segura; la aplicación no requiere correo electrónico para funcionar.
- Administradores pueden **editar** el nombre visible y el nombre de usuario de una cuenta (el nuevo nombre se usa desde ese momento; el historial conserva la firma de cuando se actuó).
- Administradores pueden **desactivar/reactivar** usuarios, conservar íntegra su autoría en entregas, fotos, auditoría y revisiones. Desactivar invalida sesiones y evita nuevos accesos/asignaciones. Las asignaciones existentes pueden conservarse inactivas y vuelven a aplicar tras reactivación según su estado.
- Administradores pueden cambiar el **rol global**: antes de confirmarlo, deben previsualizar y resolver asignaciones incompatibles. El cambio no altera quién creó/revisó objetos anteriores. El acceso se evalúa con el rol actual.
- Prohibido desactivar, borrar o degradar al **último administrador activo**. Sí se admite **eliminar** una cuenta: se borra el registro y se revocan sesiones y asignaciones, pero su **firma histórica se conserva** mediante los nombres congelados en entregas, revisiones, fotos y auditoría (no aparece como «eliminado»). La desactivación sigue disponible para retirar el acceso sin borrar la cuenta.
- Quitar una asignación revoca acceso inmediatamente sin modificar las acciones históricas. No borra evidencia ni entregas. Reasignar permite continuar el borrador compartido o revisar una entrega pendiente.

## 3. Servicios

### Campos y ciclo de vida

- `contrato` **obligatorio**: todo servicio pertenece a un contrato (la migración inicial crea «General» y mueve los servicios previos). Cambiar de contrato revoca las asignaciones de usuarios que no pertenezcan al nuevo, con confirmación previa.
- `nombre` requerido, `descripción` opcional, vínculo opcional a un ítem de catálogo de edificios (sin jerarquía obligatoria), auditoría de creador y fechas.
- El administrador puede modificar nombre, descripción, edificio o contrato **en cualquier momento**, incluso tras aprobaciones, sin alterar las entregas ni revisiones.
- Puede añadir/quitar técnicos y supervisores por servicio, **entre los participantes del contrato**; una persona puede pertenecer a múltiples servicios.
- Puede añadir/quitar trabajos incluso cuando el servicio se había completado. El avance/estado se recalcula automáticamente.
- Puede borrar el servicio completo con confirmación que enumere impacto: **trabajos, elementos, fotos vigentes e históricas, entregas, revisiones, asignaciones y notificaciones vinculadas**. No se borran usuarios ni catálogos globales.

### Estado derivado

- **Completado:** si y solo si existe **al menos un trabajo** y **todos los trabajos** están aprobados.
- **No completado:** servicio vacío o con cualquier trabajo no aprobado, incluyendo trabajo dividido sin elementos.
- La UI puede ofrecer porcentaje de avance y etiquetas de atención, pero **no debe crear un estado de cierre manual** ni permitir declarar terminado algo incompleto.
- Añadir un elemento pendiente a un trabajo dividido previamente aprobado vuelve ese trabajo y potencialmente el servicio a no completado; las aprobaciones históricas de los demás elementos no se alteran.

## 4. Catálogos globales y vínculos

### Estructura

- Catálogos con identificador, nombre y descripción opcional; ítems con identificador, nombre, orden y posible metadato simple no imprescindible.
- Cada catálogo tiene un **tipo**: `general` (nombres de trabajos/elementos), `buildings` (edificios de servicio) o `requirements` (requisitos fotográficos). Los selectores ofrecen solo el tipo que corresponde.
- Los **catálogos de requisitos** son listas reutilizables de nombres (p. ej. `Antes`, `Después`, `Detalle`). El requisito sigue siendo por *target*: puede **ligarse** a un ítem (nombre dinámico) o guardar su propio nombre; renombrarlo a mano lo desvincula.
- Relación opcional entre ítems de distintos catálogos, p. ej. `Edificio A ↔ Piso 34` o `Piso 34 ↔ UMA 03`. Una relación expresa asociación, **no impone jerarquía universal ni propiedad física**.
- Los catálogos no son exclusivos de un servicio ni dependen de marcas/productos.
- El administrador puede crear obras manuales o usar catálogos para generar múltiples trabajos y/o elementos con una **vista previa** de resultados, excepciones y posibles duplicados en contexto.
- Ejemplo orientativo: 34 pisos como trabajos, con 4 UMAs como elementos en cada uno; tanto piso como UMA pueden provenir de catálogos globales. No confundir ítem maestro compartido con una instancia física específica dentro de un servicio.

### Nombre vinculado o personalizado

- Un trabajo/elemento generado desde catálogo guarda `catalog_item_id` y **presenta dinámicamente** `catalog_item.name`; los cambios de nombre global se reflejan en todas las instancias aún vinculadas.
- Si el administrador cambia **solo el nombre de un trabajo/elemento**, ese registro se desvincula (`catalog_item_id = NULL`) y guarda `custom_name`; desde entonces ya no cambia cuando se renombra el catálogo.
- El creado manualmente siempre usa `custom_name` sin vínculo.
- Al eliminar un **ítem de catálogo**, se ejecuta **una transacción** que (1) copia su último nombre a `custom_name` de todos los trabajos/elementos vinculados; (2) elimina esos vínculos; (3) elimina las relaciones entre ítems que le correspondan; (4) elimina el ítem; (5) conserva servicios, trabajos, elementos, fotos y revisiones.
- Si el ítem eliminado se usaba como **edificio del servicio**, conservar el último nombre visible (p. ej. `building_name_snapshot` o equivalente), desvincular su ID y no afectar el servicio.
- Renombrar un trabajo/elemento aprobado o rechazado no modifica las entregas ya realizadas. Para trazabilidad, una entrega puede conservar también nombre contextual al momento del envío, aunque la navegación vigente muestre el nombre actual.

## 5. Trabajos: directos y divididos

| Regla | `direct` | `divided` |
|---|---|---|
| Unidad que contiene fotos/requisitos/entregas | El propio trabajo | Cada elemento hijo |
| Revisión | Del trabajo | Individual por elemento |
| Criterio de aprobación del trabajo | Su última entrega está aprobada | Tiene ≥1 elemento y todos aprobados |
| ¿Permitir elementos? | No | Sí |
| ¿Fotos en el padre además de elementos? | Sí, por ser objetivo | **No** |

- Se pueden editar nombre y descripción del trabajo o elemento en cualquier momento; no cambia el historial de fotografías ni la decisión de revisión.
- Al **crear** un trabajo (o al **generar en lote**, o al **añadir elementos**) se pueden elegir requisitos —de catálogo o libres— que se aplican al objetivo directo o a **cada** elemento; se omiten duplicados por nombre.
- Los administradores pueden añadir o quitar elementos de un trabajo dividido **en cualquier momento**, incluso si estaba aprobado.
- Borrar un elemento o trabajo elimina destructivamente su evidencia y todo su historial, previa advertencia y confirmación explícita. Afecta al avance sin revertir las aprobaciones independientes de objetos que permanecen.

### Conversión entre modos

Solo se permite convertir `direct` ↔ `divided` cuando el trabajo **nunca ha tenido una entrega** (ni actual, ni pasada; incluso si fue rechazada). La comprobación se realiza en servidor justo al confirmar. No basta con que el trabajo esté hoy `pending`.

- El asistente exige **asignación manual completa** de cada foto vigente y de cada requisito al destino; no mover fotos de manera implícita, no crear un elemento con el mismo nombre automáticamente, no borrar fotos para resolver ambigüedades.
- En `direct → divided`, se deben crear los elementos de destino y elegir para cada foto/requisito el elemento al que pertenecerá.
- En `divided → direct`, se decide manualmente cómo consolidar fotos y requisitos, incluyendo conflictos de nombres o requisitos que no puedan fusionarse sin intervención.
- La conversión es **previsualizable, cancelable y transaccional**, con validación de cambios concurrentes y total de fotos/requisitos asignados. Si no se pueden asignar todas las fotos, no se confirma.
- Una vez exista una entrega de cualquier objetivo dentro del trabajo, el modo permanece fijo para siempre mientras el trabajo exista.

## 6. Requisitos fotográficos y captura

### Configuración

- Un objetivo puede tener **cero o más** requisitos nombrados, cada uno con `name`, `sort_order`, `is_required` (por defecto `true`).
- Todo objetivo dispone además de un grupo virtual **Adicionales** sin límite funcional de fotos.
- La cantidad de fotos en un requisito es **ilimitada**; el requisito requerido significa **al menos una** foto en ese grupo al enviar, no una cantidad máxima o exacta.
- Si no hay requisitos obligatorios, para enviar se exige **al menos una fotografía total**. La presencia de requisitos opcionales vacíos no invalida el envío.
- Los requisitos se pueden crear/renombrar/reordenar/eliminar/cambiar de requerido a opcional **solo hasta antes del primer envío de ese objetivo**. Después quedan congelados aunque la entrega haya sido rechazada o aprobada.
- Si el administrador elimina un requisito antes de ese primer envío, las fotos actuales de dicho requisito pasan automáticamente a **Adicionales** conservando orden relativo y autoría. Esta es la **única excepción** al bloqueo de traslado de fotos entre grupos.

### Evidencia compartida

- Todos los técnicos asignados al mismo servicio trabajan sobre **una única evidencia vigente** del objetivo. Cualquiera puede agregar, retirar o reordenar fotos existentes, también las subidas por otro técnico. Registrar autoría de cada foto y de cada retirada.
- Cada fotografía pertenece exactamente a un grupo de la evidencia (`requirement_id` o adicionales); **no puede cambiarse de grupo directamente**. Para corregir su agrupación, se retira de la evidencia vigente y se vuelve a cargar en el grupo correcto.
- El orden de fotografías puede reorganizarse **dentro de su grupo**, nunca arrastrando entre grupos. El orden vigente se guarda y se copia a cada entrega.
- Se permiten subidas múltiples, previsualización, progreso y reintento. En móviles, ofrecer captura con cámara o selección de galería según capacidades del navegador.
- No hay texto descriptivo por fotografía. Sí hay fecha/hora y nombre de quien la subió para trazabilidad.
- El servidor optimiza foto original de gran tamaño (tamaño máximo de lado orientativo: 2560 px) y genera miniatura (~400 px), orienta correctamente y elimina metadatos innecesarios/ubicación GPS. Formatos de entrada: JPEG, PNG y WebP; HEIC cuando la capacidad real de conversión esté disponible.
- Límites permitidos: tamaño **por archivo** configurable, cupo real del servidor, tipos y validación de seguridad; **no** imponer máximo de fotos por servicio/objetivo/grupo.

### Estados de la unidad de evidencia

| Estado | Cuándo ocurre | ¿Edición por técnicos/admin? | ¿Revisión? |
|---|---|---|---|
| `pending` | Sin primera entrega y sin fotos vigentes | Sí | No |
| `in_progress` | Fotos vigentes, sin entrega en revisión ni aprobación y sin rechazo como último resultado | Sí | No |
| `in_review` | Última entrega enviada y sin revisión | No | Sí |
| `rejected` | Última entrega fue rechazada; evidencia desbloqueada para corregir | Sí | No, hasta siguiente envío |
| `approved` | Última entrega fue aprobada | No, aprobación definitiva del objetivo | No |

`pending` y `in_progress` solo distinguen si hay fotos vigentes cuando no existe una revisión previa relevante. `rejected` persiste como contexto aunque se agreguen/retiren fotos; se transforma en `in_review` en el siguiente envío.

## 7. Envíos y revisiones

### Enviar evidencia

- El envío se realiza desde el objetivo completo, no por foto ni por requisito.
- Antes del envío, mostrar diálogo con **cantidad de fotografías** y aviso de que quedará bloqueada para todos los técnicos.
- El servidor valida rol/asignación, estado editable, versión actual, fotos cargadas/procesadas y requisitos requeridos; exige ≥1 foto total.
- En **una transacción atómica**, crea la entrega y sus entradas `submission_photos` con IDs, grupos y orden exactos, fija su secuencia y bloquea evidencia pasando a `in_review`.
- Se registra quién envió y cuándo. La evidencia vigente se conserva; su snapshot no se sustituye durante una corrección.
- Si otra persona modificó la evidencia antes de confirmar, el cliente recibe **conflicto** y debe recargar; no enviar una foto o reordenamiento obsoleto.

### Revisar

- Se revisa **la entrega completa**; no existen aprobaciones por fotografía.
- Un supervisor **asignado** o administrador puede aprobar o rechazar `in_review`.
- En UI, **ambas** decisiones exigen diálogo y confirmación. Para rechazar, se exige **motivo no vacío**; para aprobar no hay motivo obligatorio.
- El servidor comprueba permisos y que entrega/objetivo sigan pendientes; la primera decisión que se confirma gana **atómicamente**. Una segunda revisión concurrente se rechaza y muestra el resultado actual.
- **Aprobación:** crea revisión inmutable, bloquea permanentemente evidencia de ese objetivo; actualiza avance agregado.
- **Rechazo:** crea revisión inmutable con razón; desbloquea evidencia vigente para que cualquier técnico asignado corrija y **reenvíe nueva entrega**. Las fotos existentes no se borran por el rechazo.
- No hay edición/borrado de una revisión existente ni «reabrir» una aprobación. Un administrador puede borrar destructivamente el objetivo/trabajo/servicio bajo las reglas administrativas.

### Historial

- La pantalla abre mostrando **evidencia vigente**. Una sección/pestaña **Historial** muestra entregas de la más reciente a la más antigua.
- Cada entrada contiene número, fecha, autor del envío, fotografías tal como se enviaron, agrupación y orden, fecha/autor de revisión, decisión y motivo si rechazo.
- Todo historial es **solo lectura** y permanece disponible mientras el objetivo exista, incluso si se retiran fotografías del borrador vigente.
- Si se borran fotos del borrador que pertenecían a una entrega previa, los archivos históricos continúan almacenados y disponibles hasta una eliminación destructiva expresamente autorizada.

## 8. Concurrencia y auditoría

- No hay bloqueo exclusivo por editor. Dos técnicos pueden capturar simultáneamente.
- Cada objetivo tiene versión monotónica de evidencia; **retirar fotos, reordenar, agrupar por eliminación de requisito, convertir y enviar** usan versión esperada y comparación atómica; subir fotos hace append seguro y avanza versión.
- El navegador indica conflicto y solicita refrescar sin sobrescribir silenciosamente cambios de otro técnico. UI puede mostrar autor/fecha actualizados tras recarga, pero no requiere sockets.
- Guardar autor y tiempo de subidas, retiradas, envíos, revisiones y mutaciones estructurales críticas. Historial auditable no equivale a poder editar snapshots.
- Las fechas persistidas en UTC y mostradas según zona del usuario o zona configurable de la instancia.

## 9. Notificaciones

- Al crear una entrega (incluida corrección), notificar **a todos los supervisores activos actualmente asignados** al servicio; no al resto de usuarios ni automáticamente a los administradores.
- Al aprobar/rechazar, notificar **a todos los técnicos activos actualmente asignados** al servicio, porque comparten evidencia.
- Cada destinatario recibe una entrada en su **bandeja interna** con estado leído/no leído, fecha, texto, enlace protegido, contador y acción marcar leído (individual/todos).
- Intentar **Web Push VAPID** a sus suscripciones activas. El error de push no invalida la entrega/revisión ni su notificación interna.
- El enlace profundo debe comprobar rol y asignación **al abrirse**; revocar acceso o desactivar usuario impide abrirlo incluso si el push ya llegó.
- El envío de Web Push puede hacerse después del commit con reintento moderado sin cola externa obligatoria.

## 10. Descargas y exportaciones

| Recurso | Roles | Alcance / contenido |
|---|---|---|
| Fotografía individual | Los tres, con permiso de servicio | Archivo optimizado persistido; acceso autenticado |
| Entrega ZIP | Los tres, con permiso de servicio | **Una entrega histórica o vigente**, exactamente su snapshot, carpetas por requisito + `Adicionales`, archivos ordenados |
| Servicio ZIP | Los tres, con permiso de servicio | **Última entrega aprobada** de cada objetivo; omite no aprobados; carpetas servicio/trabajo/elemento/requisito; `resumen.csv` con incluidos y omitidos |
| CSV administrativo | Solo admin | Filtrado por servicio/estado; una fila por trabajo directo o elemento dividido, con contexto, estados, fechas, revisor y conteo de fotos; **sin fotografías** |

- Un ZIP de servicio puede exportarse **antes** de completarse. Debe declarar claramente los pendientes y omisiones.
- Cuando el trabajo es directo, sus carpetas de requisito viven en la carpeta del **trabajo**; no inventar elemento hijo.
- El ZIP respeta el orden de cada grupo y usa nombres de carpetas saneados, únicos y compatibles con distintos sistemas operativos.
- Toda exportación se genera con comprobación de permisos en servidor y sin modificar registros. ZIP grandes: streaming o temporales con limpieza.
- El CSV administrativo se ofrece en UTF-8 y formato interpretable por Excel/LibreOffice, evitando inyección de fórmulas.

## 11. Descubrimiento y presentación

- Dashboard adaptado al rol: técnico → servicios asignados, evidencia pendiente/rechazada; supervisor → servicios asignados y cola de entregas por revisar; admin → panorama global y accesos a gestión.
- Navegación progresiva: `servicio → trabajo → elemento (si divided) → evidencia`.
- **Búsqueda global** por nombre de servicio, trabajo y elemento, con contexto y enlace directo, siempre filtrada en servidor por permisos; filtros por estado en listas.
- Captura en **una sola pantalla** de secciones plegables (requisitos y Adicionales al final), galerías, carga, ordenación y botón enviar abajo; **no** wizard de varios pasos.
- PWA optimizada para teléfonos en el campo, administradores/supervisores también en escritorio. En v1 requiere conectividad para operar.

## 12. Fuera de alcance y cambios de alcance

No implementar sin nueva decisión: trabajo offline con cola/sincronización, comentarios por foto, estados manuales de cierre, aprobación parcial por requisitos, edición de fotos in situ, roles configurables, multi-tenant, gestión de contratos, integración con ERP, firma digital, reportes PDF, asignación de supervisor a objetivos sueltos en vez de servicio, panel avanzado de BI.

**Reglas de precedencia:** una validación de seguridad o integridad prevalece sobre la comodidad de UX. Cualquier operación no definida debe mantener el carácter agnóstico, el historial y la autorización estricta.
