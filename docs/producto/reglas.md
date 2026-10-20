# Producto, alcance y reglas de negocio

> **Audiencia:** producto, administradores y desarrollo.
> **Estado:** vigente.
> **Fuente canónica de:** reglas de negocio, roles, permisos e invariantes.

## 1. Visión y alcance

Lumen registra **evidencia fotográfica del trabajo realizado** y controla su
revisión. No administra órdenes de compra, inventario físico, facturación ni
mantenimiento predictivo. El **contrato** agrupa servicios y participantes; no
contiene datos legales o comerciales.

El producto se dirige a equipos internos de decenas de usuarios en una instancia
autohospedada. Las **escrituras requieren conexión**. Existe un modo consulta
offline de solo lectura con la estructura y los estados de los servicios
asignados; no incluye fotos, no permite modificar nada y no hay cola de
sincronización.

Para los términos del dominio, véase el [`glosario`](glosario.md).

## 2. Roles y autorización

| Capacidad | Administrador | Supervisor asignado | Técnico asignado |
|---|---:|---:|---:|
| Consultar contrato, servicio, trabajo, elementos y participantes | Sí, todo | Sí, su ámbito | Sí, su ámbito |
| Buscar globalmente dentro del ámbito autorizado | Sí | Sí | Sí |
| Administrar usuarios, roles y activación | Sí | No | No |
| Crear, editar o eliminar contratos | Sí | No | No |
| Gestionar participantes del contrato | Sí | Sí, en sus contratos | No |
| Administrar tipos, catálogos, ámbitos e ítems | Sí | No | No |
| Crear, editar o borrar servicios, trabajos, elementos y requisitos | Sí | No | No |
| Asignar servicios a participantes | Sí | Sí, solo miembros existentes de su contrato | No |
| Subir, retirar y reordenar fotos de evidencia vigente | Sí | No | Sí |
| Enviar una entrega de evidencia | Sí | No | Sí |
| Aprobar o rechazar entregas | Sí | Sí | No |
| Descargar una fotografía individual | Sí | Sí | Sí |
| Descargar ZIP de entrega, servicio, trabajo o contrato | Sí | Sí | No |

Un usuario debe estar **activo** y tener una sesión válida para cualquier
operación. La autorización se resuelve en servidor en cada lectura, escritura,
búsqueda, descarga, exportación y enlace profundo.

### Ámbito

La jerarquía es **contrato → servicio → trabajo/elemento**:

- Los administradores tienen ámbito global.
- Supervisores y técnicos solo acceden a servicios con asignación activa y
  mientras sigan siendo miembros activos del contrato con el rol correspondiente.
- Salir del contrato retira el acceso, aunque la asignación de servicio siga
  marcada.
- Los participantes del contrato son la única población asignable a sus
  servicios.
- Un administrador puede incorporar al usuario al contrato al asignarle un
  servicio. Un supervisor del contrato solo puede asignar a miembros existentes.
- La vista de participantes muestra nombre visible y rol; nunca credenciales ni
  datos sensibles.

## 3. Usuarios

- El primer arranque configura la **primera cuenta administradora** de forma
  atómica. Después solo los administradores crean cuentas.
- La autenticación es local, con nombre de usuario y contraseña. No se requiere
  correo electrónico.
- Los administradores pueden editar el nombre visible y el nombre de usuario.
  El historial conserva la firma del momento de cada acción.
- Los administradores pueden desactivar y reactivar cuentas. La desactivación
  invalida sesiones, evita nuevos accesos y conserva la autoría histórica.
- El cambio de rol exige previsualizar y resolver asignaciones incompatibles.
  No reescribe autores ni revisiones anteriores.
- Está prohibido desactivar, eliminar o degradar al **último administrador
  activo**.
- Eliminar una cuenta borra el registro, revoca sesiones y asignaciones, pero
  conserva los nombres congelados en entregas, revisiones, fotos y auditoría.
- Retirar una asignación revoca el acceso de inmediato; no borra evidencia,
  entregas ni historial.

## 4. Contratos

- El contrato es el nivel superior y agrupa servicios.
- Tiene nombre único, descripción opcional, participantes y configuración de PDF
  de evidencia.
- Solo los administradores crean, editan o eliminan contratos.
- No se elimina un contrato con servicios: primero se mueven o eliminan.
- Los participantes se gestionan en modal. Un supervisor del contrato puede
  añadir o revocar participantes de sus contratos.
- Revocar a una persona del contrato revoca en cascada sus asignaciones de
  servicio dentro de ese contrato.
- El administrador puede configurar un fondo PNG/JPG y los márgenes de PDF del
  contrato. Los detalles de exportación están en
  [`referencia/exportaciones.md`](../referencia/exportaciones.md).

### Ciclo de vida del contrato

- Estados: `active`, `inactive` y `archived`. Todo contrato nace `active`.
- `inactive` es una pausa temporal y exige que no queden servicios `active` ni
  `planned`. Se puede reactivar.
- `archived` es terminal y exige que todos sus servicios estén archivados. No se
  reactiva.
- Archivar no reescribe aprobaciones, entregas, fotos ni participantes. El
  contrato y sus recursos quedan visibles en solo lectura.
- Un contrato `inactive` o `archived` no admite servicios nuevos.

## 5. Servicios

### Datos y ciclo de vida

- `contrato` obligatorio. La migración inicial crea «General» y mueve los
  servicios existentes.
- Estados: `planned`, `active`, `inactive` y `archived`. Todo servicio nace
  `active`, salvo que el administrador marque «Crear en espera».
- `planned` permite preparar trabajos, elementos y requisitos, pero **no capturar
  evidencia ni enviar**. Pasar a `active` exige que el contrato esté activo.
- `inactive` es una pausa temporal: la evidencia y las revisiones son de solo
  lectura. Se puede reactivar si el contrato está activo.
- `archived` es terminal y solo se permite cuando el servicio está completado.
  No se reactiva.
- Archivar no convierte el servicio en «completado» por sí mismo ni reescribe
  aprobaciones: el completado sigue siendo derivado. Los recursos archivados
  quedan visibles en solo lectura.
- Un servicio archivado no admite cambios de estructura ni de asignaciones.
- `nombre` requerido, `descripción` opcional y vínculo opcional a un ítem de
  catálogo de edificios.
- Cambiar un servicio de contrato revoca las asignaciones de usuarios que no
  pertenezcan al nuevo contrato, con confirmación previa.
- Se pueden añadir o quitar participantes entre los miembros del contrato.
- Se pueden añadir o quitar trabajos en cualquier momento mientras el servicio
  no esté archivado, incluso después de completarlo. El avance se recalcula.
- El administrador puede borrar el servicio con confirmación e impacto
  detallado. Se eliminan trabajos, elementos, fotos, entregas, revisiones,
  asignaciones y notificaciones vinculadas. No se borran usuarios ni catálogos
  globales.

### Estado derivado

- **Completado:** existe al menos un trabajo y todos los trabajos están
  aprobados.
- **No completado:** servicio vacío o con cualquier trabajo no aprobado,
  incluido un trabajo dividido sin elementos.
- La UI puede mostrar porcentaje y etiquetas de atención. No existe un estado
  manual de cierre.
- Añadir un elemento pendiente a un trabajo aprobado vuelve el trabajo y el
  servicio a no completados. Las aprobaciones de los demás elementos se
  conservan.

## 6. Catálogos

- Los **tipos de catálogo** son administrables (nombre y orden). El tipo
  `Edificios` es de sistema y no puede eliminarse; identifica los ítems que
  pueden usarse como edificio de un servicio.
- Un catálogo tiene nombre, descripción opcional, tipo, orden y **ámbito de
  edificios**:
  - global: disponible en todos los servicios;
  - limitado: disponible solo en los edificios seleccionados.
- El ámbito se valida en servidor al construir los selectores del servicio y en
  cada escritura. No basta con ocultarlo en la interfaz.
- Los ítems tienen nombre, orden y pertenecen a un catálogo. No se permiten
  duplicados de nombre dentro del mismo catálogo.
- No existen propósitos fijos ni relaciones entre ítems de catálogos distintos.
- Al crear un trabajo, elemento o requisito se elige el **tipo de catálogo** que
  se quiere examinar. Es un filtro de navegación: el vínculo guardado sigue
  siendo el ítem de catálogo elegido.
- Un trabajo, elemento o requisito puede estar **vinculado** a un ítem de
  catálogo o tener un **nombre propio**. Nunca ambos.
- Renombrar el ítem global actualiza los registros aún vinculados.
- Renombrar solo la instancia la desvincula y conserva su nombre propio.
- Al eliminar un ítem, los registros vinculados copian el último nombre, se
  desvinculan y conservan fotos, entregas y revisiones. La operación es
  transaccional.
- El administrador puede generar varios trabajos o elementos desde catálogos,
  con vista previa de resultados, duplicados y excepciones. Sin relaciones, los
  elementos seleccionados se aplican a todos los trabajos seleccionados; la
  vista previa lo advierte y permite ajustar antes de confirmar.

## 7. Trabajos y elementos

| Regla | `direct` | `divided` |
|---|---|---|
| Unidad de evidencia | El trabajo | Cada elemento |
| Revisión | Del trabajo | Individual por elemento |
| Aprobación | Última entrega aprobada | Al menos un elemento y todos aprobados |
| Elementos | No | Sí |
| Fotos en el padre | Sí, porque es el objetivo | No |

- Se pueden editar nombre y descripción en cualquier momento. El historial no
  cambia.
- Al crear un trabajo, generar en lote o añadir elementos se pueden elegir
  requisitos de catálogo o libres. Se aplican al objetivo directo o a cada
  elemento, omitiendo duplicados por nombre.
- Los administradores pueden añadir o quitar elementos en cualquier estado.
- Borrar un elemento o trabajo elimina su evidencia e historial con advertencia
  y confirmación. No revierte aprobaciones de objetos que permanecen.

### Conversión entre modos

Solo se permite `direct` ↔ `divided` si el trabajo **nunca ha tenido una
entrega**, ni actual ni pasada. La comprobación se hace en servidor al
confirmar.

- El asistente exige asignación manual de cada foto y requisito al destino.
- No se mueven fotos implícitamente, no se crean elementos automáticamente y no
  se borran fotos para resolver ambigüedades.
- La conversión es previsualizable, cancelable y transaccional, con control de
  concurrencia.
- Si falta una sola foto o requisito por asignar, no se confirma.

## 8. Requisitos y evidencia

### Requisitos

- Un objetivo puede tener cero o más requisitos con nombre, orden y marca
  obligatorio/opcional.
- Todos los objetivos tienen un grupo virtual **Adicionales**, sin límite
  funcional de fotos.
- La cantidad de fotos por requisito es ilimitada. «Obligatorio» significa al
  menos una foto en ese grupo al enviar.
- Si no hay requisitos obligatorios, se exige al menos una fotografía total.
- Los requisitos se pueden crear, renombrar, reordenar, eliminar y cambiar de
  obligatoriedad **solo antes del primer envío de ese objetivo**. Después quedan
  congelados, incluso si la entrega fue rechazada.
- Si se elimina un requisito antes del primer envío, sus fotos pasan
  automáticamente a Adicionales conservando orden y autoría. Es la única
  excepción al bloqueo de traslado entre grupos.

### Evidencia compartida

- Todos los técnicos asignados trabajan sobre una única evidencia vigente del
  objetivo. Cualquiera puede añadir, retirar o reordenar fotos, incluidas las
  subidas por otro técnico.
- Se registra autoría de cada subida, retirada, envío y revisión.
- Una foto pertenece a un solo grupo. No existe «mover» entre requisitos: se
  retira de la evidencia vigente y se vuelve a subir en el grupo correcto.
- El orden se cambia dentro del grupo, nunca entre grupos.
- El servidor normaliza orientación, tamaño, miniatura y metadatos. Formatos de
  entrada: JPEG, PNG y WebP; HEIC solo si la compilación lo soporta.
- Los límites son por archivo, tipo y almacenamiento. No hay máximo funcional de
  fotos por objetivo o grupo.
- No hay texto descriptivo por foto. Sí se conservan fecha, hora y autor.

### Estados del objetivo

| Estado | Cuándo ocurre | ¿Edición? | ¿Revisión? |
|---|---|---|---|
| `pending` | Sin primera entrega y sin fotos vigentes | Sí | No |
| `in_progress` | Fotos vigentes, sin entrega en revisión ni aprobación | Sí | No |
| `in_review` | Última entrega enviada y sin revisar | No | Sí |
| `rejected` | Última entrega rechazada; evidencia desbloqueada | Sí | No hasta el siguiente envío |
| `approved` | Última entrega aprobada | No | No |

`rejected` persiste aunque se añadan o retiren fotos; cambia a `in_review` en el
siguiente envío.

## 9. Envíos y revisiones

### Enviar

- El envío se hace desde el objetivo completo, no por foto ni por requisito.
- Antes de enviar se muestra la cantidad de fotos y el aviso de bloqueo para
  todos los técnicos.
- El servidor valida rol, asignación, estado editable, versión, fotos
  procesadas y requisitos obligatorios; exige al menos una foto total.
- En una transacción atómica crea la entrega y sus fotos con IDs, grupos y orden
  exactos, fija la secuencia y pasa el objetivo a `in_review`.
- Se registra autor y fecha. La evidencia vigente se conserva.
- Si otra persona modificó la evidencia, el cliente recibe conflicto y debe
  recargar.

### Revisar

- Se revisa la entrega completa. No hay aprobación por foto.
- Un supervisor asignado o un administrador puede aprobar o rechazar una
  entrega en `in_review`.
- Ambas decisiones exigen confirmación en UI. El rechazo exige motivo no vacío.
- El servidor comprueba permisos y estado; la primera decisión confirmada gana
  atómicamente. Una segunda revisión concurrente recibe conflicto.
- Aprobar crea una revisión inmutable, bloquea la evidencia y actualiza el
  avance.
- Rechazar crea una revisión inmutable con motivo y desbloquea la evidencia para
  corregir y reenviar. No borra fotos.
- No se edita ni se reabre una revisión. El administrador puede borrar
  destructivamente el ámbito completo con las reglas administrativas.

### Historial

- La vista principal muestra la evidencia vigente; el historial queda separado.
- Cada entrega conserva número, fecha, autor, fotos, agrupación, orden, revisor,
  decisión y motivo de rechazo.
- El historial es de solo lectura y permanece mientras exista el objetivo.
- Las fotos históricas se conservan aunque se retiren del borrador vigente.

## 10. Concurrencia y auditoría

- No hay bloqueo exclusivo por editor. Dos técnicos pueden capturar a la vez.
- Cada objetivo tiene versión monotónica. Retirar, reordenar, convertir y enviar
  usan versión esperada y comparación atómica.
- Subir fotos es un append seguro que avanza la versión.
- Los conflictos se muestran al usuario; no se sobrescriben cambios ajenos.
- Se registran autor y fecha de subidas, retiradas, envíos, revisiones y
  mutaciones estructurales críticas.
- Las fechas se guardan en UTC y se presentan según la zona configurada.

## 11. Notificaciones

- Al crear una entrega se notifica a todos los supervisores activos asignados y
  a los administradores activos, excepto a quien envía.
- Al aprobar o rechazar se notifica a todos los técnicos activos asignados y a
  los administradores activos, excepto a quien revisa.
- Cada destinatario recibe una entrada persistente en su bandeja interna, con
  estado leído/no leído, fecha, texto y enlace protegido.
- Web Push es best effort. Un fallo de push no revierte la entrega, la revisión
  ni la notificación interna.
- El enlace profundo revalida rol y asignación al abrirse.
- El push puede enviarse después del commit, con reintento moderado y sin cola
  externa obligatoria.

## 12. Descargas y exportaciones

| Recurso | Administrador | Supervisor asignado | Técnico asignado |
|---|---:|---:|---:|
| Fotografía individual | Sí | Sí | Sí |
| ZIP de entrega | Sí | Sí | No |
| ZIP de trabajo | Sí | Sí | No |
| ZIP de servicio | Sí | Sí | No |
| ZIP de contrato | Sí | Sí, supervisor del contrato | No |

El contenido, las jerarquías, las variantes de XLSX y el PDF por trabajo se
definen en [`referencia/exportaciones.md`](../referencia/exportaciones.md).
Toda descarga comprueba permisos en servidor y no modifica registros.

## 13. Descubrimiento y presentación

- Dashboard adaptado al rol:
  - Técnico: servicios asignados, evidencia pendiente, rechazada y en curso.
  - Supervisor: servicios asignados y cola de revisión.
  - Administrador: panorama global y accesos de gestión.
- Navegación `servicio → trabajo → elemento (si dividido) → evidencia`.
- Búsqueda global por nombre de servicio, trabajo y elemento, con contexto y
  enlace directo, siempre filtrada en servidor.
- Captura en una sola pantalla con secciones plegables, galería, carga,
  ordenación y envío. No es un wizard.
- PWA optimizada para móvil; administración y revisión cómodas en escritorio.
  En v1 requiere conectividad.

## 14. Fuera de alcance

No implementar sin una nueva decisión de alcance:

- trabajo offline con cola o sincronización;
- mensajería entre usuarios;
- comentarios o revisión por fotografía individual;
- estados manuales de cierre o aprobación parcial por requisito;
- edición de fotos in situ;
- roles configurables o multi-tenant;
- gestión integral de contratos, ERP o facturación;
- firma digital;
- informes PDF de negocio;
- panel avanzado de BI.

El **PDF de evidencia por trabajo** sí forma parte de la v1.

## 15. Precedencia

Una validación de seguridad o integridad prevalece sobre la comodidad de la UX.
Cualquier operación no definida debe mantener el carácter agnóstico del producto,
el historial inmutable y la autorización estricta.
