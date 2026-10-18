# Sistema de UI y patrones de implementación

> **Audiencia:** desarrollo de frontend y diseño.
> **Estado:** vigente.
> **Fuente canónica de:** tokens, componentes, breakpoints, tamaños y patrones de
> implementación.

La experiencia, las pantallas y el copy están en
[`../producto/experiencia.md`](../producto/experiencia.md). Este documento
describe cómo se implementa esa experiencia con los componentes compartidos.

## 1. Tipografía y color

- **Tipografía:** Inter variable; pesos 400, 500 y 600. Números tabulares para
  métricas y tablas.
- **Escala:** título de vista `text-xl md:text-2xl`; secciones
  `text-base font-medium`; cuerpo `text-sm`; meta `text-xs text-muted-foreground`.
- **Color:** azul profundo como acento primario; teal para progreso completado y
  métricas positivas; verde semántico para aprobado.
- **Estados:** `StatusBadge` mapea `pending`, `in_progress`, `in_review`,
  `rejected` y `approved` a tokens `--state-*`. No se escriben colores de estado
  a mano en las vistas.
- **Tema:** claro, oscuro y sistema. La preferencia se guarda en el dispositivo
  y «Sistema» sigue `prefers-color-scheme`.

## 2. Forma, espacio y controles

- **Radios:** controles `rounded-lg` (6 px); superficies `rounded-xl` (10 px);
  diálogos `rounded-2xl` (12 px); badges tipo pill.
- **Superficies:** canvas (`--background`), tarjeta (`--card`) e inset
  (`--surface-inset`). Las tarjetas usan `--shadow-card`; el hover de elementos
  destacados usa `--shadow-lift`. No se usan sombras grandes ni difusas.
- **Bordes:** 1 px. El canvas y el sidebar tienen valores distintos para separar
  capas sin depender solo del borde.
- **Espaciado:** página `space-y-6`; interior `space-y-3/4`; gaps `gap-2/3`.
- **Altura de controles:**
  - `Input` y `NativeSelect`: `h-10` en escritorio, `max-md:h-11`.
  - Botón `default`: `h-9`, con `max-md:min-h-11`.
  - Botón `sm`: `h-8` para tablas y toolbars.
- **Controles compartidos:** `Input`, `NativeSelect`, `LabeledCheckbox`,
  `Textarea`, `Button`, `Badge`, `Chip`. No se usan `<select>` o
  `<input type="checkbox">` crudos salvo en componentes base o radios de tarjeta.
- **Foco:** `focus-visible:ring-3 ring-ring/50`; nunca se elimina el foco sin
  sustituto visible.

## 3. Tablas y listados

- Todos los listados usan `DataTable`.
- Chrome: `rounded-xl border bg-card`; celdas `px-4 py-3`; cabecera
  `h-11 text-xs text-muted-foreground`.
- La columna **Acciones** va al final (`w-px text-right`) y usa `TableActions`
  (`flex items-center justify-end gap-2`).
- Si la fila entera es un enlace, las acciones añaden `relative z-10`.
- Columnas secundarias se ocultan por debajo de `lg` (`hidden lg:table-cell`).
- Números y fechas se alinean a la derecha con `tnum text-muted-foreground`.
- En móvil (`< md`) la tabla se sustituye por tarjetas con las mismas acciones.
- Las tablas anchas hacen scroll dentro de su tarjeta (`overflow-x-auto`); nunca
  desbordan la página.

## 4. Fichas y navegación

- Fichas: breadcrumbs, cabecera de escala única y cuerpo en dos columnas
  (`lg`), con rail de datos/acciones.
- Listado ≠ ficha. Los listados usan `DataTable`; las fichas usan composición
  propia.
- El título de vista vive en la cabecera (`h1` único, `#page-title`). El
  contenido usa `PageIntro` para descripción y acciones, sin repetir el `h1`.
- En móvil, breadcrumbs ocultos y descripción limitada en fichas.
- La tarjeta o fila completa puede ser enlace; el nombre del recurso es el
  enlace principal. No se añaden botones «Abrir» o «Ver».
- El ítem activo del sidebar usa fondo azul tenue, texto e icono primarios y una
  barra interior. En la barra inferior móvil, el ítem activo usa texto primario y
  un fondo azul muy tenue.

## 5. Modales y overlays

- `Dialog`:
  - `sm`: 420 px.
  - `default`: 560 px.
  - `lg`: 720 px.
  - `xl`: 880 px.
- `AlertDialog`: 440 px (`default`) o 400 px (`sm`).
- Escritorio: máximo 88vh, centrado, cabecera fija, cuerpo desplazable y footer
  fijo.
- Móvil: bottom sheet de 92dvh, sin radio inferior, con animación de entrada
  desde abajo.
- `Dialog.Body` es el cuerpo desplazable; `Dialog.Section` agrupa campos con
  título y descripción.
- El footer móvil ordena Cancelar antes de la acción primaria.
- Las confirmaciones destructivas usan `AlertDialog`, no avisos inline.
- El panel «Más» móvil es un bottom sheet con cuenta, accesos y cierre de sesión.

## 6. Formularios y altas

- Los formularios usan `Label`, `Input`, `NativeSelect` y mensajes de error
  asociados con `aria-invalid` y `aria-describedby`.
- **Sin selección por defecto** en altas y añadidos obligatorios: placeholder
  «Selecciona…».
- Los opcionales usan una opción explícita cuando exista («General», «Sin
  edificio») o se dejan vacíos con un placeholder claro. Nunca se preselecciona
  el primer registro.
- Los filtros conservan «Todos» como valor inicial.
- Las ediciones mantienen el valor guardado.
- Las acciones primarias se deshabilitan hasta completar lo mínimo cuando el
  coste de un envío inválido es alto.
- Los modales de alta agrupan el contenido en secciones: datos, ubicación,
  estructura, requisitos o resumen.
- El footer resume la operación cuando ayuda: elementos, requisitos, impacto o
  número de fotos.

## 7. Selectores de catálogo

`CatalogPicker` es el selector de catálogo compartido:

- Agrupa por propósito: **Generales**, **Edificios**, **Requisitos**.
- Muestra nombre, descripción y número de ítems.
- Permite buscar por nombre o descripción.
- El selector de ítems permanece deshabilitado hasta elegir catálogo.
- No preselecciona el primer catálogo ni el primer ítem.
- `CatalogItemPicker` y `CatalogItemMultiPicker` combinan `CatalogPicker` con un
  combobox de ítems.
- El combobox de ítems permite buscar y, en modo simple, volver a pulsar el ítem
  seleccionado para limpiarlo.

## 8. Asignaciones

`ParticipantManager` es el compositor compartido por contrato y servicio:

- Primero se elige rol (Técnico o Supervisor); después, persona.
- No hay rol ni persona preseleccionados.
- La persona solo se habilita cuando hay candidatos para el rol.
- La acción Añadir permanece deshabilitada hasta completar rol y persona.
- Las listas de técnicos y supervisores se muestran separadas.
- Revocar abre la confirmación correspondiente.

## 9. Chips, estados y métricas

- `Chip`: fondo tenue, texto del color y ring interior del mismo tono.
- `StatusBadge` reutiliza `Chip` y añade un punto de color como señal redundante.
- `LifecycleBadge` usa `Chip` para `En espera`, `Activo`, `Inactivo` y
  `Archivado`; el archivado de contrato se etiqueta como «Contrato archivado».
- `LifecycleFilter` agrupa botones con `aria-pressed` y contador por estado. Es
  la única forma de filtrar listados por ciclo de vida.
- El modo Directo/Dividido usa chip neutro.
- En filas, los chips se alinean al final.
- `ProgressMeter`: barra con marcas, `X/Y`, porcentaje y `role="progressbar"`;
  azul en curso y teal al completar.
- `MiniMeter`: barra compacta para progreso de elementos.
- `MetricCard`: tarjeta con icono tintado, regla superior de color, etiqueta,
  valor o contenido (por ejemplo, un medidor).
- `StatusSpectrum`: barra segmentada de estados con contadores y leyenda.
- `ReviewTrend`: actividad diaria de envíos, aprobaciones y rechazos en 30 días,
  con barras CSS y sin librería de gráficos.
- `ScopePulse`: contratos (admin) o servicios (supervisor) con progreso, cola,
  rechazos y última actividad.
- `ReviewQueue`: cola ordenada por antigüedad, con aviso visual a partir de 24 h.
- `RecentDecisions`: últimas aprobaciones y rechazos, motivo y enlace a la
  entrega.
- El color del estado se refuerza con el rail lateral de filas y tarjetas, no
  solo con el chip.
- El dashboard incluye una franja o cuadrícula de **evidencia reciente** con
  miniaturas reales; las fotos aportan el color natural del producto.
- `EmptyState` usa icono tintado, fondo inset y borde discontinuo; no es una caja
  blanca vacía.
- El estado no se comunica solo por color.

## 10. Accesibilidad

- Un único `h1` por vista.
- Foco visible en todos los controles.
- Diálogos con foco atrapado, Esc para cerrar y retorno de foco.
- Formularios con etiqueta, error asociado y texto de ayuda.
- Reordenación con alternativa de teclado/botones, no solo drag-and-drop.
- Galerías con texto alternativo funcional.
- `prefers-reduced-motion` respetado.
- Contraste suficiente en claro y oscuro.
- Los botones destructivos se distinguen de las acciones positivas.
- Los estados de carga usan `role="status"`; los errores de acción,
  `role="alert"`.

## 11. Componentes y convenciones

- Componentes base de shadcn-svelte en `src/lib/components/ui/`.
- Componentes de producto en `src/lib/components/`.
- Los textos accesibles de los componentes base están traducidos al español
  directamente en su archivo; al actualizar shadcn-svelte hay que revisar esas
  traducciones.
- Los imports usan `#lib` / `#lib/*`.
- Las rutas se generan con `resolve()`; los componentes de shadcn-svelte están
  exentos.
- No se introduce una segunda librería de UI sin una decisión explícita.
