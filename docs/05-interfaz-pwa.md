# 05 — Interfaz, experiencia móvil y PWA

## 1. Principios de diseño

- **Mobile-first para técnicos** que capturan fotografías con el teléfono; administración y revisión cómodas en escritorio y tablet.
- La prioridad visual en captura es **la evidencia actual y sus datos**; el historial queda separado y no distrae.
- Los requisitos son secciones plegables dentro de **una única pantalla**, no un wizard de pasos.
- Navegación comprensible: `Servicio → Trabajo → Elemento (solo si dividido) → Evidencia`.
- Controles, enlaces, descargas y resultados nunca muestran recursos fuera del permiso del usuario.
- Usar shadcn-svelte/Tailwind con contraste adecuado, formularios etiquetados, foco visible, tamaño táctil suficiente y diseño responsivo.
- **Escritorio**: el área de contenido crece con la plantilla de la página (listados/tablero/búsqueda más anchos que las fichas); los listados usan **tablas** densas y las fichas se organizan en **dos columnas** (contenido + rail de datos/acciones). El progreso se muestra con un **instrumento medido** por objetivos aprobados. En móvil nada de esto cambia: las capas de escritorio se añaden con `lg:`/`xl:` y las tablas permiten desplazamiento horizontal.
- No imponer flujos complejos de asignación, validación o aprobación. No requerir interacción en tiempo real ni trabajo offline.

## 2. Sistema de UI (contrato)

- **Título de vista en la cabecera**: el `h1` de cada página vive en la barra superior (`#page-title`, `text-sm font-medium md:text-base`, `truncate`) y lo aporta el `load` de cada ruta (`title`). El contenido usa `PageIntro` (descripción, solo escritorio, + acciones) y **no repite el `h1`**; el `<title>` de la pestaña se mantiene aparte. Ventaja: un único `h1` por vista y cabecera siempre contextual.
- **Tipo**: secciones `text-base font-medium`; cuerpo `text-sm`; meta `text-xs text-muted-foreground`.
- **Altura de control**: `h-9` en `Input`, `NativeSelect` y botón `default`; `h-8` en botón `sm` (acciones de tabla/toolbar).
- **Radios**: superficies `rounded-xl`; controles `rounded-lg`; badges tipo pill.
- **Espaciado**: página `space-y-6`; interior `space-y-3/4`; gaps `gap-2/3`.
- **Controles**: siempre los componentes compartidos `Input`, `NativeSelect`, `LabeledCheckbox`, `Textarea` (no `<select>`/`<input type="checkbox">` crudos).
- **Estado**: `StatusBadge` mapea `pending / in_progress / in_review / rejected / approved` a los tokens `--state-*` (ámbar, azul de atención, rojo, verde). El color del estado no se escribe a mano en las vistas.
- **Chips unificados** (`Chip`): fondo tenue + texto del color, sin borde; `StatusBadge` los reutiliza y el **modo** (Directo/Dividido) va en chip neutro. En las filas, los chips van **alineados al final**.
- **Medidor**: `ProgressMeter` sin etiqueta (barra + `X/Y` + `%`); `MiniMeter` (barra compacta + `X/Y`) para el progreso de elementos de un trabajo dividido. La cabecera de servicio integra metadatos (Edificio/acceso) como etiqueta tenue + valor y el medidor como firma.
- **Asignaciones**: el administrador asigna/revoca participantes en `/admin/services/[serviceId]`, accesible desde el listado de Servicios y desde la **ficha del servicio** (botón «Gestionar asignaciones» y enlace «Asignar» en Participantes). Los supervisores y técnicos no asignan.
- **Listado ≠ ficha**: los listados usan `DataTable`; las fichas, breadcrumbs + cabecera de escala única.
- **Vacíos**: páginas y pestañas usan `EmptyState`; los vacíos dentro de tarjetas/menús quedan como texto atenuado.
- **Tablas unificadas**: todos los listados usan el componente `DataTable` (chrome `rounded-xl border bg-card`; celdas `px-4 py-3`; cabecera `h-11 text-xs text-muted-foreground`); ninguna vista monta su propia tabla a mano. La columna **Acciones** va siempre **al final** (`w-px text-right`) y su contenido se agrupa con `TableActions` (`flex items-center justify-end gap-2`), añadiendo `relative z-10` solo cuando la fila entera es un enlace. Las columnas secundarias se ocultan por debajo de `lg` (`hidden lg:table-cell`) y las **numéricas/fechas** se alinean a la derecha con `tnum text-muted-foreground`. En móvil (`< md`) la tabla se sustituye por **tarjetas** con las mismas acciones.
- **Nada desborda la página**: las tablas anchas hacen scroll **dentro de su tarjeta** (`overflow-x-auto`) y las filas de pestañas también (`overflow-x-auto no-scrollbar`); el contenido puede encogerse (`min-w-0`). Las **filas de acciones de las cabeceras** se ponen en columna en móvil y **envuelven** sus botones (`w-full` + `flex-wrap`, sin `shrink-0`). En móvil, las tablas de administración se muestran como **tarjetas** para que todas las acciones queden visibles.
- **Edición y alta en modal**: editar servicio/trabajo/catálogo, crear ítem de catálogo, añadir y renombrar requisitos, renombrar ítem/elemento, gestionar participantes y desactivar usuario abren un `Dialog`/`AlertDialog` (los avisos de cada formulario se acotan a su modal). Las fichas quedan para consulta y acciones contextuales.
- **Confirmaciones destructivas en modal**: toda acción que borra/retira/revoca algo (retirar foto, eliminar requisito, eliminar ítem o catálogo, revocar asignación, eliminar servicio/trabajo/elemento/usuario, aprobar/rechazar) confirma en un **`AlertDialog`** (no en avisos inline), mostrando el resumen de impacto cuando aplique. **Desactivar** usuario también confirma.
- **Móvil (`< md`)**: navegación por **barra inferior** por rol (zona del pulgar), **siempre visible** —también en las pantallas de captura, donde la **barra de acción fija** («Enviar evidencia») se coloca por encima—; el buscador de la cabecera se reduce a un icono; controles con área táctil **≥ 44 px**; los **breadcrumbs se ocultan**; los listados se muestran como **tarjetas** (en `md+` como tabla); y los diálogos abren como **bottom sheet**. Cabecera compacta: título `text-xl` (`lg:text-3xl`) y descripción **oculta en listados** y **limitada a 2 líneas** en fichas. Se respetan las *safe areas* (`viewport-fit=cover` + `env(safe-area-inset-*)`) y el `theme-color` del sistema.
- **Tarjeta enlazada (sin botones «Abrir»/«Ver»)**: el **nombre del recurso es el enlace** y, en móvil, un *enlace estirado* (`after:absolute after:inset-0` sobre un `<li class="relative">`) hace que **toda la tarjeta** navegue. Las acciones secundarias/destructivas quedan dentro con `relative z-10`.
- **Fila clicable**: en las **tablas** de escritorio el enlace principal se **estira sobre toda la fila** (fila `relative`) y las celdas de acciones van en `relative z-10`; en móvil, la **tarjeta entera** es clicable (`after:absolute after:inset-0` sobre un `<li class="relative">`) con feedback táctil (`active:bg-muted/50`).
- **Título + badges**: los badges van **fuera del `h1`**, en un contenedor hermano `flex items-center gap-3` con el título **`min-w-0 truncate`** y los badges **`shrink-0`** (`h-5`, `whitespace-nowrap`), alineados a la línea del título.
- **Errores de campo**: cada mensaje de error se asocia a su control con `aria-invalid` y `aria-describedby` (el `<p>` lleva `id`); los avisos de formulario usan `Alert` (`role="alert"`) y las confirmaciones de acción `Alert role="status"`.
- **Componentes base en español**: los textos accesibles de los componentes de shadcn-svelte (cerrar diálogo/hoja, alternar menú, paleta de comandos) se traducen en su sitio; divergen de upstream y hay que reevaluarlos al actualizar.

## 3. Mapa de navegación

```text
Autenticación
  ├── Primer arranque / Configurar administrador (solo si sin admins)
  └── Iniciar sesión

Aplicación (sesión)
  ├── Inicio (dashboard adaptado al rol)
  ├── Buscar (global)
  ├── Contratos (admin: todos; supervisor: los suyos)
  │    └── Detalle del contrato: datos, participantes y servicios
  ├── Servicios
  │    └── Detalle del servicio
  │         ├── Resumen / participantes / avance
  │         ├── Trabajos
  │         │    └── Trabajo directo ──► Evidencia actual | Historial
  │         │    └── Trabajo dividido ─► Lista elementos
  │         │                               └── Elemento ──► Evidencia actual | Historial
  │         └── Exportar evidencias aprobadas (ZIP)
  ├── Revisiones pendientes (supervisor y admin)
  ├── Notificaciones / Bandeja interna
  ├── Perfil / Activar notificaciones push
  └── Administración (solo admin)
       ├── Contratos (crear/editar/eliminar y participantes)
       ├── Usuarios y roles
       ├── Catálogos e ítems / relaciones
       ├── Servicios y asignaciones
       ├── Trabajos, elementos y requisitos
       └── Exportar ZIP (contrato/servicio/trabajo)
```

El usuario siempre dispone de breadcrumb o contexto compacto del servicio/trabajo/elemento, sin multiplicar páginas para la captura.

## 4. Navegación general y layout

### Móvil

- **Barra inferior por rol**: Técnico **Inicio · Servicios · Avisos · Perfil**; Supervisor **Inicio · Revisiones · Contratos · Avisos · Perfil**; Admin **Inicio · Servicios · Revisiones · Avisos · Más**. «Revisiones» lleva **contador** (solo admin/supervisor) y «Avisos» el de no leídas, acotados por ámbito. La **búsqueda no es pestaña**: vive en la cabecera (campo en `md+`, icono en móvil). En el sidebar, admin y supervisor ven «Contratos».
- Buscador global accesible desde el menú superior o inicio.
- Cards de servicios/trabajos con estado legible y progreso; objetivo táctil amplio.
- Acción primaria de captura/envío claramente accesible sin tapar galerías; respetar safe area del teléfono.
- En estados no editables, controles de subida/orden/eliminar ocultos o deshabilitados con causa visible.

### Escritorio

- Sidebar de navegación persistente o adaptable; la barra superior muestra el **título de la vista** y el buscador global; el contenido principal, con ancho cómodo, filtros y tablas de administración.
- Supervisores: cola de revisión con filtros de servicio, estado y fecha.
- Administradores: acciones de catálogo, asignaciones, exportación y configuración con paneles de detalle.

## 5. Dashboard por rol

| Rol | Contenido prioritario | Acciones |
|---|---|---|
| Técnico | Objetivos pendientes, en progreso y rechazados; próximos por completar (los **servicios** van en su pestaña) | Abrir captura, ver rechazo, cambiar de servicio |
| Supervisor | Entregas en revisión de servicios asignados; totales y avance | Abrir revisión, aprobar/rechazar, consultar |
| Admin | Totales por estado, revisiones pendientes, accesos a usuarios/catálogos/servicios | Gestionar, revisar, capturar, exportar |

No mostrar contador «todos los servicios» a supervisores si incluye los no asignados. Cualquier número visible está acotado por permisos.

La **selección de servicio vive en su propia pestaña** (`/services`), no en el tablero: así una cola larga de pendientes no la desplaza. En el tablero, «Requiere tu atención» (rechazados) se muestra completo, mientras que **«Pendientes» se limita a 5** con «Mostrar todos (N)».

## 6. Lista y detalle de servicios

**Contratos (nivel superior):** `/contracts` lista los contratos del usuario (admin: todos; supervisor: los suyos). La ficha del contrato muestra datos (edición en **modal**, admin), **participantes** (añadir/revocar; solo el admin o un supervisor del contrato) y **servicios** con su avance. Al crear/editar un servicio se exige **contrato**; los participantes asignables a un servicio son los del contrato. El administrador, al asignar un servicio, incorpora al usuario al contrato si faltaba; un supervisor solo usa miembros existentes.
**Lista:** tarjetas o tabla responsiva, nombre del servicio, edificio opcional, progreso (objetivos aprobados / totales), indicación completado/incompleto. Se sirve en **dos rutas**: `/services` (técnico/supervisor: **solo sus servicios asignados**, orientada a seleccionar y entrar) y `/admin/services` (admin: creación/edición/borrado). El progreso por servicio se agrega en una consulta, sin N+1.

**Detalle de servicio:**

- Encabezado con nombre, descripción, edificio y estado calculado.
- Participantes (técnicos y supervisores) visibles para personas asignadas, con nombres y roles pertinentes.
- Lista de trabajos y su tipo: `Directo` o `Dividido`, avance y estado. En **móvil** cada trabajo se muestra como **tarjeta/banner** (nombre, chips de modo/estado, medidor de progreso y «Abrir →», con toda la tarjeta clicable); en escritorio, fila compacta con borde y divisores. Mismo DOM en ambos casos.
- Descarga de **ZIP de evidencias aprobadas del servicio** disponible también si no completado, con texto que indica inclusión solo de objetivos aprobados y relación de omitidos.
- Admin puede editar datos del servicio (**modal** desde la cabecera) y gestionar participantes (**modal** con asignar/revocar), sin forzar a técnicos a atravesar esos formularios.

## 7. Trabajo directo y trabajo dividido

### Directo

- Al pulsar el trabajo, entrar directamente a **Evidencia** (no inventar un elemento homónimo).
- Visualizar estado, requisitos, fotos, botón de envío y pestaña de historial.

### Dividido

- Al pulsar trabajo, mostrar lista de **elementos** con estado individual y contador/progreso de elementos aprobados.
- Entrar a un elemento para capturar/consultar su evidencia.
- Si no tiene elementos, estado incompleto y mensaje de vacío; admin con CTA «Agregar elementos».
- La galería del trabajo padre **no existe**; prohibido agregar carga/fotos al padre.

## 8. Pantalla de evidencia: principal

### Estructura orientativa

```text
┌────────────────────────────────────────┐
│ Servicio / Trabajo / Elemento          │
│ UMA 03                    [Rechazado]   │
│ [Evidencia actual] [Historial]         │
├────────────────────────────────────────┤
│ ⚠ Rechazo anterior: falta foto...      │  (solo si rechazado)
├────────────────────────────────────────┤
│ ▾ Antes                  3 fotografías │
│   [miniatura][miniatura][miniatura]     │
│   [+ Tomar foto] [+ Elegir fotos]      │
│                                        │
│ ▾ Durante                2 fotografías │
│   [miniatura][miniatura]               │
│   [+ Tomar foto] [+ Elegir fotos]      │
│                                        │
│ ▾ Después                0 fotografías │
│   Obligatorio · falta evidencia        │
│   [+ Tomar foto] [+ Elegir fotos]      │
│                                        │
│ ▾ Adicionales            0 fotografías │
│   [+ Tomar foto] [+ Elegir fotos]      │
├────────────────────────────────────────┤
│ [Enviar evidencia]                     │
└────────────────────────────────────────┘
```

- Secciones nombradas en orden configurado por admin; badge `Obligatorio` y progreso por sección; **Adicionales siempre al final**.
- Secciones expandibles/plegables que mantienen contexto y minimizan desplazamiento.
- Miniatura con fecha y autor opcional en overlay/detalle; clic abre visualizador grande de solo lectura con navegación, descarga y metadatos mínimos.
- Edición disponible en `pending`, `in_progress`, `rejected` para técnico/admin autorizado; `in_review` y `approved` solo lectura.
- Arrastrar para ordenar dentro de sección; **alternativa accesible** mediante botones Mover arriba/abajo. Prohibido arrastrar a otra sección.
- Retirar foto actual: diálogo simple si implica retirar una foto compartida por otros; avisar que no borra historial ya enviado. Registrar quién la retira.
- Para equivocación de sección, instrucción concreta: «Retira esta foto y súbela en la sección correcta». No ofrecer botón «Mover».
- Si un requisito ya fue enviado alguna vez, la UI admin deja claros sus campos congelados.

### Carga múltiple

- Botones separados según capacidad: cámara y elegir fotografías, sin depender exclusivamente de `capture` del navegador.
- Varias fotos por selección, progreso por foto, estados cargando/procesando/lista/error, reintentar fallidas.
- Mantener visibles fotos exitosas si una de varias falla; no crear una entrega hasta que terminen las que deban incluirse.
- Errores accionables: formato no soportado, tamaño excesivo, almacenamiento lleno, conexión perdida, permiso revocado o conflicto de versión.

## 9. Enviar evidencia

1. Mostrar botón principal solo si es editable y usuario puede enviar.
2. Validación cliente orientativa de grupos requeridos para UX rápida, **sin sustituir validación servidor**. El **checklist de envío** (regla compartida servidor/UI) marca cada requisito obligatorio sin evidencia («Falta evidencia») y resume junto al botón lo que falta («Falta evidencia obligatoria en: …»); si nada está completo, el diálogo lo explica y deshabilita «Confirmar envío». El servidor sigue siendo la única fuente autoritativa.
3. Abrir diálogo:
   - «¿Enviar esta evidencia a revisión?»
   - «Se enviarán **N fotografías**.»
   - «La edición quedará bloqueada para todos los técnicos hasta que sea revisada.»
   - Botones «Cancelar» / «Confirmar envío».
4. Tras confirmar, deshabilitar doble envío y mostrar progreso. Si servidor devuelve `409`, no fingir éxito: mostrar «La evidencia cambió; actualiza antes de enviar».
5. En éxito, estado `in_review`, fotos lectura y enlace al historial de Entrega #N.

## 10. Bandeja de revisión

### Lista

Filtrada automáticamente por permisos: supervisor solo servicios asignados; admin todos. Cada tarjeta muestra servicio, trabajo/elemento, fecha, número de entrega y remitente. Filtros por servicio, fecha y búsqueda.

### Detalle

- Fotos de la **entrega a revisar**, no una versión transitoria distinta.
- Secciones y orden originales.
- Acciones primarias **Aprobar** y **Rechazar**.
- **Ambas requieren diálogo de confirmación** antes de ejecutar.

**Aprobar:**

```text
Confirmar aprobación
¿Confirmas que esta entrega cumple con lo solicitado?
Una vez aprobada, la evidencia quedará bloqueada.
[Cancelar]  [Confirmar aprobación]
```

**Rechazar:**

```text
Confirmar rechazo
Describe qué deben corregir los técnicos.
[Motivo del rechazo * ...................]
[Cancelar]  [Confirmar rechazo]
```

Motivo de rechazo obligatorio, con aviso de campo vacío y longitud máxima razonable configurable. Si otro supervisor decidió primero, cerrar diálogo, avisar y recargar; jamás mostrar dos decisiones como exitosas.

## 11. Historial independiente

- Tabs o sección visible: **Evidencia actual | Historial**.
- La primera vista es **Actual**, aunque haya varios rechazos.
- Historial ordenado **de la entrega más reciente a la más antigua**. La tarjeta de cada entrada muestra #, autor, fecha y estado: pendiente de revisión, aprobada o rechazada.
- Al abrir, ver galería congelada, grupos, orden, revisor/fecha y motivo del rechazo. Nada editable.
- Botones de descarga individual y ZIP por entrega en el detalle histórico (el ZIP por entrega no se ofrece a los técnicos).
- En versión rechazada, destacar motivo en la pestaña Actual para que técnico sepa qué corregir sin tener que buscarlo en historial.

## 12. Administración de catálogos

- Lista de catálogos con búsqueda, **pestañas por tipo** (Todos / Generales / Edificios / Requisitos) y acciones agregar/editar. Al crear o editar (**modal**), se elige el **tipo**. El alta de ítems y el renombrado también son **modales**.
- Detalle de ítems, relaciones opcionales con ítems de otros catálogos, orden, usos.
- Relaciones **por ítem**: cada ítem muestra su número de relaciones y abre un modal para verlas en ambos sentidos, añadir una y quitar. El **sentido** (origen → destino) es explícito y afecta a la generación en lote.
- Relaciones **en lote**: varios ítems de este catálogo con un único ítem de otro catálogo, en cualquiera de los dos sentidos, con resumen previo («se crearán X; Y ya existen y se omitirán») y sin duplicar relaciones existentes.
- Al renombrar ítem, mostrar texto breve: «Se actualizarán los nombres de los trabajos/elementos aún vinculados».
- Al borrar ítem, diálogo de impacto: «Los trabajos y elementos vinculados conservarán su nombre actual y dejarán de estar vinculados; sus evidencias no se borrarán».
- Al renombrar trabajo/elemento vinculado, advertir: «Este cambio lo desvinculará del catálogo».

## 13. Administración de servicios/trabajos/elementos

- Formularios simples: nombre, descripción, edificio opcional, participantes asignados.
- Selector de modo directo/dividido al crear trabajo, con explicación visible de dónde vivirán fotos y aprobaciones.
- Crear trabajos/elementos manualmente o **en lote** desde catálogo. Vista previa antes de aplicar lote: árboles/fila, cantidad final, duplicados contextuales, opciones de excepción por instancia. Al crear un trabajo o generar en lote se pueden elegir **requisitos** (de catálogo o libres) que se aplican al objetivo directo o a cada elemento; al añadir elementos a un trabajo existente también.
- Editar/eliminar trabajos y elementos en cualquier estado, con advertencia de eliminación **destructiva** de todas las fotos e historial del ámbito. La edición del trabajo (nombre/descripción) se hace en un **modal** desde la cabecera de la ficha; el renombrado de elementos, en un **modal pequeño** por fila.
- Administrar requisitos en cada target mientras no exista primer envío; se pueden **añadir varios desde un catálogo de requisitos** (omitiendo duplicados) o escribir requisitos libres en un **modal** (pestañas «Nuevo» / «Desde catálogo»); renombrarlos (modal) los desvincula. Opción de copiar plantilla a elementos recién creados sin enlazarles requisitos posteriormente.
- Cambiar modo abre asistente de reasignación de fotos y requisitos, **solo si nunca hubo envío**; no crear destino/suprimir fotos automáticamente. Permitir cancelar sin cambios.
- Acciones de borrado de servicio/trabajo/elemento requieren nombre del recurso, resumen de dependencias afectadas y confirmación explícita (puede requerirse escribir el nombre para recursos con historial).

## 14. Buscar

- Buscador global desde header o navegación; búsqueda por **nombre** de servicio, trabajo, elemento.
- Resultados separados o etiquetados por tipo, con rutas contextuales como «UMA 03 — Mantenimiento / Piso 34».
- Búsqueda con debounce moderado, estado cargando, sin resultados, errores y opción abrir resultado mediante teclado.
- Resultados filtrados en servidor por roles/asignaciones, incluso si se consulta API sin UI.
- **Filtros de búsqueda**: por **tipo** (servicios/trabajos/elementos) y por **servicio**; se aplican en servidor y el selector de servicio solo ofrece los servicios del ámbito del usuario.
- Las listas locales conservan filtros por estado y nombre para navegación detallada.

## 15. Notificaciones y perfil

- Campana con contador de no leídas en layout principal.
- Bandeja con eventos de entrega y revisión, fecha, contexto, resumen, marca leído individual y todo leído; clic abre destino protegido.
- **Perfil** (`/settings`, pestaña «Perfil»): tarjeta **«Cuenta»** con nombre visible, usuario y rol, y **«Cerrar sesión»** (`POST /logout`) — accesible en móvil.
- Opción «Activar notificaciones push» que explica permisos y limitaciones de navegadores; botón real para solicitar permiso **solo tras interacción del usuario**.
- Si push no está disponible o se deniega, mostrarlo sin tratarlo como fallo de la aplicación; bandeja interna sigue activa.
- Permitir eliminar suscripción del dispositivo actual y limpiar suscripciones obsoletas.

## 16. Exportaciones en UI

- Foto: menú o icono Descargar en visualizador.
- Entrega: «Descargar ZIP de esta entrega» tanto en actual enviada como historial.
- **Contrato / Servicio / Trabajo**: botón «Exportar ZIP» en la ficha que abre un **modal de configuración** con:
  - **Variante del registro XLSX**: `Simple` (`Edificio · Trabajo · Estado · Evidencia · Notas`, sin hoja Resumen) o `Extendida` (hoja `Resumen` + todas las columnas).
  - Casillas **«Incluir registro XLSX»**, **«Incluir fotografías»** e **«Incluir PDF de evidencia por trabajo»** (se exige al menos una). Sin fotografías, los PDF caen en la carpeta del servicio.
  - Botón «Descargar» (recuerda la última elección en el dispositivo).
- Jerarquías: contrato `Contrato ▸ Edificio ▸ Servicio ▸ Trabajo ▸ (Elemento) ▸ Requisito`; servicio `Servicio ▸ Trabajo ▸ (Elemento) ▸ Requisito`; trabajo `Trabajo ▸ (Elemento) ▸ Requisito`.
- Solo se incluye la **última entrega aprobada** de cada objetivo para las fotos; **no** se generan archivos de resumen.
- **Evidencia** en el XLSX: hipervínculo relativo al PDF del trabajo. Excel/LibreOffice resuelven rutas relativas; Google Sheets no.
- **PDF de evidencia**: tarjeta en la ficha del contrato (solo admin) para subir/reemplazar/quitar el **fondo** (PNG/JPG) y configurar los **márgenes en mm** (arriba · abajo · izquierda · derecha, 10–80) compartidos por los PDF de sus servicios.
- En descargas grandes, feedback de inicio/error; no prometer barra de progreso si streaming nativo no permite medirlo de manera robusta.

## 17. Estados de interfaz y accesibilidad

- **Cargando / vacío / error / sin permiso / conflicto / sin conexión / bloqueado** distinguidos, con acción útil donde corresponda.
- **Regla de feedback**: el **resultado de una acción de página** (formulario) se confirma con un
  aviso **persistente** `Alert role="status"` (visible y anunciado, el usuario puede releerlo); las
  **acciones rápidas de cliente** (borrado puntual, relaciones por lote, generación) usan **toast**;
  los **errores de validación** van **junto al campo** y los **errores de acción** con
  `Alert` (`role="alert"`). Nunca fallar en silencio.
- **Navegación**: mientras se carga una ruta se muestra un indicador superior con `role="status"`, y el contenedor principal expone `aria-busy`.
- **Errores de página**: 404/403/500 tienen una vista propia en español, con marca y acción de salida («Ir al inicio») y reintento, en lugar de la página por defecto.
- Se respeta `prefers-reduced-motion` reduciendo animaciones y transiciones.
- No comunicar estados solo mediante color: texto e iconografía redundante («Rechazado», «En revisión», «Aprobado»).
- Diálogos con foco atrapado apropiadamente, Esc para cancelar, confirmación explícita al destruir/revisar; motivo de rechazo vinculado a etiqueta accesible.
- Reordenación mediante teclado/botones, no únicamente drag-and-drop táctil.
- Galerías con texto alternativo funcional (p. ej. «Foto 2 de 5, Antes») y miniaturas diferidas para bajo ancho de banda.
- Controles grandes para dedos y suficiente contraste sobre fondos claros/oscuros.
- Diseño de botones destructivos con jerarquía visual distinta de acciones positivas.

## 18. PWA y experiencia de red

- Manifest e instalación correctos en Android/escritorio/iOS compatible; verificar modo standalone y deep links.
- La aplicación es **online-only**. Sin red, mostrar pantalla o banner de desconexión; **no** indicar que las fotos quedaron enviadas ni guardadas en servidor.
- El service worker no debe servir evidencia privada cacheada a la sesión de otro usuario en el mismo dispositivo.
- Para notificaciones push, permitir activación informada; en iOS compatible suele requerir instalación en pantalla de inicio.
- Pérdida de red durante upload: fallos claros y reintento, sin dejar recursos `processing` indefinidos.

## 19. Textos de interfaz sugeridos

| Caso | Mensaje |
|---|---|
| Estado en revisión | «Esta evidencia está en revisión. No se puede modificar hasta que se decida.» |
| Estado aprobado | «Evidencia aprobada. Las fotografías están bloqueadas.» |
| Rechazo | «Entrega rechazada: revisa el motivo y envía una corrección.» |
| Falta requisito | «Falta al menos una fotografía en “Después”.» |
| Conflicto versión | «Otro técnico modificó esta evidencia. Actualiza para continuar.» |
| Revisión resuelta por otro | «Esta entrega ya fue revisada. Se muestra la decisión más reciente.» |
| Sin permiso | «No tienes acceso a este servicio.» |
| Cambio de modo bloqueado | «No se puede cambiar el modo porque este trabajo ya tiene entregas.» |
| Borrado de ítem catálogo | «Los registros vinculados conservarán el nombre y sus evidencias.» |
| Exportación de servicio | «Solo se incluirán entregas aprobadas. Los pendientes aparecerán en el resumen.» |
