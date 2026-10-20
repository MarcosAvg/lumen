# Experiencia de uso y pantallas

> **Audiencia:** producto, diseño y desarrollo de UI.
> **Estado:** vigente.
> **Fuente canónica de:** principios de experiencia, pantallas, navegación,
> estados, accesibilidad y textos de interfaz.

Los detalles de componentes, tokens, clases y breakpoints están en
[`desarrollo/sistema-ui.md`](../desarrollo/sistema-ui.md).

## 1. Principios

- **Mobile-first para técnicos** que capturan con el teléfono. Administración y
  revisión son cómodas en escritorio y tablet.
- La prioridad visual en captura es la **evidencia actual y sus datos**. El
  historial queda separado.
- Los requisitos son secciones plegables dentro de **una única pantalla**, no un
  wizard.
- Navegación comprensible: `Servicio → Trabajo → Elemento (si dividido) →
  Evidencia`.
- Nunca se muestran controles, enlaces, descargas o resultados fuera del permiso
  del usuario.
- No se imponen flujos complejos de asignación, validación o aprobación. La v1
  no requiere colaboración en tiempo real ni trabajo offline.

## 2. Navegación

```text
Autenticación
  ├── Primer arranque / Configurar Lumen
  └── Iniciar sesión

Aplicación
  ├── Inicio (dashboard por rol)
  ├── Buscar (global)
  ├── Contratos (admin: todos; supervisor: los suyos)
  │    └── Detalle: datos, participantes y servicios
  ├── Servicios
  │    └── Detalle
  │         ├── Resumen, participantes y avance
  │         ├── Trabajos
  │         │    ├── Directo → Evidencia | Historial
  │         │    └── Dividido → Elementos → Evidencia | Historial
  │         └── Exportar evidencias aprobadas (ZIP)
  ├── Revisiones pendientes (supervisor y admin)
  ├── Notificaciones
  ├── Perfil / notificaciones push
  └── Administración (admin)
       ├── Contratos
       ├── Usuarios y roles
       ├── Catálogos e ítems
       ├── Servicios y asignaciones
       └── Estructura de trabajos, elementos y requisitos
```

El usuario siempre tiene breadcrumb o contexto compacto del servicio, trabajo o
elemento.

## 3. Layout general

### Móvil

- Barra inferior por rol:
  - Técnico: Inicio · Servicios · Avisos · Perfil.
  - Supervisor: Inicio · Revisiones · Contratos · Avisos · Perfil.
  - Administrador: Inicio · Servicios · Revisiones · Avisos · Más.
- El buscador de la cabecera se reduce a un icono.
- Los listados se muestran como tarjetas; las fichas conservan la jerarquía de
  escritorio.
- Los diálogos abren como bottom sheet, con safe areas respetadas.
- La barra de acción de captura queda por encima de la navegación inferior.
- Los controles tienen área táctil suficiente; el foco es visible.

### Escritorio

- Sidebar persistente y barra superior con título de vista y búsqueda global.
- Listados densos en tabla; fichas en dos columnas con rail de datos y acciones.
- El contenido principal crece según el tipo de página; las fichas tienen un
  ancho más contenido.

## 4. Dashboard por rol

| Rol | Contenido prioritario | Acciones |
|---|---|---|
| Técnico | Métricas de servicios, trabajos aprobados, por corregir y en curso; listas de pendientes, en progreso y rechazados | Abrir captura, ver rechazo, cambiar de servicio |
| Supervisor | Entregas en revisión de servicios asignados; totales y avance | Abrir revisión, aprobar o rechazar, consultar |
| Administrador | Totales por estado, revisiones pendientes y accesos de gestión | Gestionar, revisar, capturar, exportar |

No se muestra a un supervisor un contador global que incluya servicios no
asignados. Los contadores se refrescan por polling cada 30 s y al volver a la
pestaña; no hay WebSockets.

Las métricas usan iconos tintados y una regla superior de color. Los paneles de
administrador y supervisor incluyen una franja de **evidencia reciente** con
miniaturas reales, estado, trabajo, servicio y autor. La franja se limita a
**6 fotos** en todos los paneles; si no hay fotos, aparece un vacío con icono de
cámara. Los estados también se refuerzan con el rail lateral de las filas y
tarjetas, no solo con el chip.

### Panel del técnico

El técnico ve primero el trabajo que requiere acción:

1. Métricas de servicios, trabajos aprobados, por corregir y en curso.
2. **Requiere tu atención**: hasta 3 trabajos rechazados.
3. **Pendientes**: hasta 5 trabajos en curso o pendientes.
4. **Evidencia reciente**: hasta 6 fotos, al final.

Los grupos de trabajo muestran el total real en las métricas y un enlace a
Servicios para consultar el resto. El panel no se expande dentro de la página y
mantiene una altura acotada aunque se acumulen entregas.

### Panel de administrador

El administrador ve un centro de mando global:

- KPIs de contratos activos, servicios activos, usuarios activos, revisiones
  pendientes, aprobaciones de los últimos 7 días y objetivos rechazados.
- **Estado de los objetivos** con un espectro segmentado por estado.
- **Actividad de revisión** de los últimos 30 días.
- **Contratos** con volumen, avance, cola de revisión y rechazos.
- **Cola de revisión** ordenada por antigüedad, con aviso si supera 24 horas.
- **Decisiones recientes** y evidencia reciente.

### Panel de supervisor

El supervisor ve su ámbito como una cola operativa:

- KPIs de servicios asignados, revisiones pendientes, objetivos por corregir,
  aprobaciones de los últimos 7 días y antigüedad máxima de la cola.
- El mismo espectro de estados y actividad de revisión, acotados a su ámbito.
- **Servicios a tu cargo** con progreso, cola, rechazos y última actividad.
- **Cola de revisión** priorizada y **decisiones recientes**.
- Evidencia reciente de sus servicios.

Las acciones rápidas permiten ir a Servicios, Usuarios, Catálogos y Contratos
(admin) o a la cola de revisión y Servicios (supervisor).

## 5. Contratos y servicios

### Contratos

- `/contracts` lista los contratos del usuario, con filtros **Activos**,
  **Inactivos** y **Archivados**. El filtro inicial es Activos.
- La ficha del contrato replica la ficha de servicio: cabecera con metadatos,
  chip de ciclo de vida y medidor de avance; cuerpo en dos columnas con
  servicios, participantes, PDF de evidencia y zona de peligro.
- Los participantes se gestionan en modal. Administradores y supervisores del
  contrato pueden añadir o revocar.
- El administrador pausa, reactiva o archiva el contrato desde la cabecera. Las
  acciones se deshabilitan con explicación si hay servicios activos/en espera o
  sin archivar. Archivar pide confirmación y el contrato archivado no muestra
  acciones de edición.

### Servicios

- `/services` muestra los servicios asignados al técnico o supervisor;
  `/admin/services` es el listado de administración.
- Ambos listados filtran por ciclo de vida (**Activos**, **En espera**,
  **Inactivos**, **Archivados**) y empiezan en Activos. La creación permite
  marcar «Crear en espera».
- La ficha muestra nombre, descripción, edificio, chip de ciclo de vida,
  participantes y trabajos.
- El administrador edita los datos en modal y gestiona participantes en otro
  modal. Un supervisor del contrato puede gestionar las asignaciones de servicio
  de su contrato.
- El administrador activa, pausa, reactiva o archiva el servicio desde la
  cabecera. Archivar exige que esté completado y pide confirmación. Un servicio
  no activo muestra un aviso y la evidencia queda en solo lectura.
- La lista de trabajos muestra modo, estado y avance. En móvil cada trabajo es
  una tarjeta clicable; en escritorio, una fila compacta.
- La exportación ZIP está disponible también si el servicio no está completo;
  el texto indica que solo se incluyen objetivos aprobados.
- La ficha ofrece **PDF del servicio** para descargar un único documento con
  portada y todos los trabajos que tengan evidencia aprobada. El modal del ZIP
  tiene dos casillas independientes: PDF por trabajo y PDF recopilado por
  servicio; el registro XLSX no cambia.

## 6. Trabajo directo y dividido

- **Directo:** al abrir el trabajo se entra directamente a Evidencia. No existe
  un elemento homónimo.
- **Dividido:** al abrir el trabajo se muestra la lista de elementos con estado
  y progreso. La galería del padre no existe.
- Si un trabajo dividido no tiene elementos, se muestra vacío y el
  administrador ve la acción para agregarlos.
- Cada elemento tiene su propia evidencia, entregas y revisiones.

## 7. Pantalla de evidencia

```text
Servicio / Trabajo / Elemento
UMA 03                              [Rechazado]
[Evidencia actual] [Historial]
──────────────────────────────────────────────
⚠ Rechazo anterior: falta foto...        (si aplica)
──────────────────────────────────────────────
▾ Antes                       3 fotografías
  [miniatura] [miniatura] [miniatura]
  [+ Tomar foto] [+ Elegir fotos]

▾ Durante                     2 fotografías
  ...

▾ Después                     0 fotografías
  Obligatorio · falta evidencia
  ...

▾ Adicionales                 0 fotografías
  ...
──────────────────────────────────────────────
[Enviar evidencia]
```

- Secciones en el orden configurado; Adicionales siempre al final.
- Cada sección muestra obligatoriedad y progreso.
- Las secciones se pliegan para reducir desplazamiento.
- La miniatura abre un visor de solo lectura con descarga y metadatos mínimos.
- La edición está disponible en `pending`, `in_progress` y `rejected` para
  técnicos y administradores. En `in_review` y `approved` es solo lectura.
- El orden se cambia dentro de la sección; existe alternativa accesible con
  botones además de arrastrar.
- Retirar una foto pide confirmación y avisa de que no borra el historial.
- Si una foto está en el grupo equivocado, la instrucción es retirarla y volver
  a subirla. No hay botón «Mover».
- Si un requisito ya tuvo un envío, la UI muestra sus campos congelados.

## 8. Carga de fotografías

- Botones separados para cámara y galería, sin depender solo de `capture`.
- Varias fotos por selección, con progreso y estado por foto.
- Las fotos exitosas permanecen visibles si otra falla.
- Se puede reintentar una carga fallida.
- No se crea una entrega hasta que las fotos incluidas estén procesadas.
- Errores accionables: formato, tamaño, almacenamiento, conexión, permiso o
  conflicto de versión.

## 9. Enviar evidencia

1. El botón principal solo aparece si el usuario puede enviar y el objetivo es
   editable.
2. El checklist de envío marca cada requisito obligatorio sin evidencia y
   resume lo que falta.
3. El diálogo muestra:
   - «¿Enviar esta evidencia a revisión?».
   - «Se enviarán N fotografías.».
   - «La edición quedará bloqueada para todos los técnicos hasta que sea
     revisada.».
   - Cancelar / Confirmar envío.
4. Tras confirmar se deshabilita el doble envío y se muestra progreso.
5. Si el servidor devuelve `409`, se muestra «La evidencia cambió; actualiza
   antes de enviar».
6. En éxito, el estado pasa a `in_review` y se enlaza la entrega.

## 10. Bandeja de revisión

- Filtrada por permisos: supervisor solo sus servicios; administrador todos.
- Cada tarjeta muestra servicio, trabajo o elemento, fecha, número de entrega y
  remitente.
- El detalle muestra las fotos de la entrega a revisar, con sus secciones y
  orden originales.
- Acciones primarias: Aprobar y Rechazar. Ambas confirman.
- Aprobar: confirma que la entrega cumple y avisa del bloqueo.
- Rechazar: exige motivo y muestra el campo con error si está vacío.
- Si otro supervisor decidió primero, se cierra el diálogo, se avisa y se
  recarga. Nunca se muestran dos decisiones como exitosas.

## 11. Historial

- Pestañas o sección **Evidencia actual | Historial**.
- La primera vista es Actual.
- Historial de la entrega más reciente a la más antigua.
- Cada entrada muestra número, autor, fecha y estado.
- Al abrir se ve la galería congelada, grupos, orden, revisor, fecha y motivo.
- Las descargas disponibles dependen del rol: foto para todos; ZIP de entrega
  solo para administrador y supervisor.
- Si la última entrega fue rechazada, el motivo se destaca también en Actual.

## 12. Administración de catálogos

- Lista con búsqueda y pestañas dinámicas por tipo de catálogo (Todos + cada
  tipo administrado).
- El botón **Tipos de catálogo** abre un modal compacto: lista de tipos con uso,
  badge **Sistema**, edición inline y alta bajo demanda. El tipo `Edificios` no se
  puede eliminar. Un tipo con catálogos tampoco.
- Crear o editar catálogo abre un modal con dos bloques: identidad y dónde
  aparece. El ámbito se elige entre «Todos» y «Edificios concretos», con una
  cinta de contexto que resume tipo y alcance.
- El detalle muestra tipo, ámbito, ítems, orden y usos. Ya no hay relaciones
  entre ítems.
- Al renombrar un ítem se avisa de que se actualizarán las instancias vinculadas.
- Al renombrar una instancia se avisa de que se desvinculará.
- Al borrar un ítem se muestra el impacto y se recuerda que las evidencias no se
  borran.

## 13. Administración de estructura

- Formularios simples: nombre, descripción, edificio opcional y participantes.
- Al crear un trabajo se elige directo o dividido, con explicación de dónde
  vivirán las fotos y las aprobaciones. Una cinta de contexto resume modo,
  elementos y requisitos.
- Los trabajos y elementos se crean manualmente o en lote desde catálogo.
- La generación en lote usa dos pasos: selección con bloques plegables y revisión
  con advertencias y nombres editables.
- Elementos y requisitos se añaden con un compositor único: desde catálogo o por
  nombre propio, con selección acumulada y lista de añadidos.
- Los requisitos se administran por objetivo mientras no exista primer envío.
  Se pueden añadir varios desde catálogo o escribir nombres libres.
- Cambiar el modo abre el asistente de reasignación, solo si nunca hubo envío.
- El borrado de servicio, trabajo o elemento muestra impacto y exige
  confirmación explícita.

## 14. Buscar

- Búsqueda global por nombre de servicio, trabajo y elemento.
- Resultados etiquetados por tipo, con ruta contextual.
- Estados de carga, sin resultados y error.
- Filtros por tipo y servicio, aplicados en servidor.
- El selector de servicio solo ofrece servicios del ámbito.
- Las listas locales conservan sus filtros por estado y nombre.

## 15. Notificaciones y perfil

- Campana con contador de no leídas.
- Bandeja con eventos de entrega y revisión, fecha, contexto, resumen y enlace.
- Marcar leído individual o todo.
- Perfil en `/settings`: cuenta, nombre visible, usuario, rol, cierre de sesión.
- Apariencia: Claro, Oscuro o Sistema; la preferencia persiste en el dispositivo.
- Activar notificaciones push explica permisos y limitaciones; el permiso se
  solicita solo tras interacción.
- Si push no está disponible, la bandeja interna sigue activa.
- Se puede eliminar la suscripción del dispositivo actual.

## 16. Exportaciones en la interfaz

- Foto: descarga desde el visor.
- Entrega: «Descargar ZIP de esta entrega» para administrador y supervisor.
- Contrato, servicio o trabajo: «Exportar ZIP» abre un modal con:
  - variante del registro XLSX: Simple o Extendida;
  - incluir registro XLSX, fotografías y PDF de evidencia (al menos uno);
  - botón Descargar;
  - preferencia recordada en el dispositivo.
- El modal explica que solo se incluyen las últimas entregas aprobadas.
- El detalle de formatos y jerarquías está en
  [`referencia/exportaciones.md`](../referencia/exportaciones.md).

## 17. Estados, errores y accesibilidad

- Se distinguen carga, vacío, error, sin permiso, conflicto, sin conexión y
  bloqueado.
- Los vacíos usan un icono tintado, fondo inset y borde discontinuo; no son
  cajas blancas con texto centrado.
- Los resultados correctos de acciones de página y de cliente se confirman con
  **toast** efímero; no se duplican con un `Alert` inline.
- Los errores de acción siguen inline con `Alert role="alert"` para no perder
  contexto.
- Los errores de validación van junto al campo, con `aria-invalid` y
  `aria-describedby`.
- Los errores de acción usan `Alert role="alert"`.
- La navegación muestra un indicador `role="status"` y el contenido expone
  `aria-busy`.
- Los 404, 403 y 500 tienen vista propia en español con acción de salida.
- Se respeta `prefers-reduced-motion`.
- Los estados no se comunican solo por color; incluyen texto e iconografía.
- Los diálogos atrapan el foco, cierran con Esc y confirman acciones
  destructivas.
- La reordenación tiene alternativa de teclado y botones.
- Las galerías tienen texto alternativo funcional y miniaturas diferidas.

## 18. PWA y red

- Manifest e instalación correctos en Android, escritorio e iOS compatible.
- Las escrituras requieren conexión. Sin red se muestra un aviso y las acciones
  de captura, envío, revisión y administración quedan deshabilitadas; no se
  simula que una foto quedó guardada en servidor.
- El modo consulta offline muestra solo estructura y estados de los servicios
  asignados, sin fotos. Indica la antigüedad del snapshot y no sirve evidencia
  privada cacheada a otra sesión.
- Si se pierde la red durante una carga, se muestra el fallo y se permite
  reintentar, sin dejar recursos `processing` indefinidos.

## 19. Textos de interfaz

| Caso | Mensaje |
|---|---|
| Estado en revisión | «Esta evidencia está en revisión. No se puede modificar hasta que se decida.» |
| Estado aprobado | «Evidencia aprobada. Las fotografías están bloqueadas.» |
| Rechazo | «Entrega rechazada: revisa el motivo y envía una corrección.» |
| Falta requisito | «Falta al menos una fotografía en “Después”.» |
| Conflicto de versión | «Otro técnico modificó esta evidencia. Actualiza para continuar.» |
| Revisión resuelta por otro | «Esta entrega ya fue revisada. Se muestra la decisión más reciente.» |
| Sin permiso | «No tienes acceso a este servicio.» |
| Cambio de modo bloqueado | «No se puede cambiar el modo porque este trabajo ya tiene entregas.» |
| Borrado de ítem de catálogo | «Los registros vinculados conservarán el nombre y sus evidencias.» |
| Exportación de servicio | «Solo se incluirán entregas aprobadas. Los pendientes aparecerán en el resumen.» |
