# Exportaciones: ZIP, XLSX y PDF

> **Audiencia:** producto, soporte, desarrollo y operación.
> **Estado:** vigente.
> **Fuente canónica de:** contenido, jerarquía, opciones y permisos de
> exportación.

## 1. Permisos

| Recurso | Admin | Supervisor asignado | Técnico asignado |
|---|---:|---:|---:|
| Fotografía individual | Sí | Sí | Sí |
| ZIP de una entrega | Sí | Sí | No |
| ZIP de trabajo | Sí | Sí | No |
| ZIP de servicio | Sí | Sí | No |
| PDF recopilado de servicio | Sí | Sí | No |
| ZIP de contrato | Sí | Sí, supervisor del contrato | No |

Un técnico descarga fotos individuales, pero no ZIP. El servidor responde `403`
antes de tocar el recurso si el rol no puede exportar. Después se revalida el
ámbito del servicio o contrato.

## 2. ZIP de entrega

- Reconstruye exclusivamente la lista `submission_photos` de esa entrega.
- Usa las secciones y el orden guardados al enviar; no la galería vigente.
- Incluye Adicionales y omite carpetas vacías.
- Los nombres de archivo usan prefijos numéricos que respetan el orden.
- Funciona igual para entregas actuales e históricas, incluidas las rechazadas.

## 3. ZIP de trabajo, servicio y contrato

- Solo incluye la **última entrega aprobada** de cada objetivo.
- Los objetivos sin entrega aprobada se omiten de las fotos; el XLSX sí puede
  listar su estado.
- Jerarquías:
  - Trabajo: `Trabajo ▸ (Elemento) ▸ Requisito`.
  - Servicio: `Servicio ▸ Trabajo ▸ (Elemento) ▸ Requisito`.
  - Contrato: `Contrato ▸ Edificio ▸ Servicio ▸ Trabajo ▸ (Elemento) ▸ Requisito`.
- El PDF recopilado del servicio se guarda como
  `<Servicio>/<Servicio> - Evidencia.pdf`, en la raíz de su carpeta. En contrato,
  dentro de `<Contrato>/<Edificio>/<Servicio>/`.
- Los servicios sin edificio se agrupan en «Sin edificio».
- En trabajos directos, las carpetas de requisito viven en la carpeta del
  trabajo; no se inventa un elemento hijo.
- Los nombres de carpetas se sanean, se desambiguan y no dependen del sistema
  operativo del cliente.
- En el ZIP de contrato, por defecto solo se incluyen servicios **activos**. La
  opción **Incluir servicios en espera, inactivos o archivados** añade el resto.
- Un ZIP puede generarse antes de completar el ámbito; solo incluye lo aprobado.

## 4. Registro XLSX

Cada ZIP de ámbito puede incluir opcionalmente un libro
`<Ámbito>/<Ámbito>.xlsx` en la raíz.

### Variantes

| Variante | Contenido |
|---|---|
| **Simple** | Una hoja por servicio con `Edificio · Trabajo · Estado · Evidencia · Notas`; sin hoja Resumen |
| **Extendida** | Hoja `Resumen` con trabajos, aprobados, en revisión, rechazados, pendientes y porcentaje de avance; una hoja por servicio con todas las columnas |

- Hay una fila por trabajo.
- La columna **Evidencia** contiene un hipervínculo relativo al PDF del trabajo.
- Excel y LibreOffice resuelven los enlaces relativos; Google Sheets no.
- El XLSX lista **todo el estado**, incluidas entregas pendientes, rechazadas y
  omitidas.
- La presentación es determinista y sin fórmulas. Usa superencabezados por área,
  tinte por columna, color por estado, chip de PDF y alto de fila ajustado.
- Los enlaces al PDF se resuelven dentro del mismo ZIP.

## 5. PDF de evidencia

### PDF por trabajo

- Se genera un PDF por trabajo con las fotos de su última entrega aprobada.
- No tiene portada. La cabecera corrida muestra contrato, edificio, servicio y
  trabajo.
- Hasta 4 fotos por página (2×2). Cada foto lleva debajo la leyenda
  `Trabajo · Elemento · Requisito`, sin fecha ni autor.
- Los márgenes se configuran por contrato en milímetros, con rango 10–80 y
  valores por defecto 50/50/15/15.
- Si el área útil es estrecha, la rejilla baja a una columna o una fila.
- El fondo del contrato se dibuja opaco en todas las páginas.
- Con fotografías, el PDF vive en la carpeta del trabajo; sin fotografías, cae
  directamente en la carpeta del servicio como `<Servicio>/<Trabajo>.pdf`.
- Los enlaces del XLSX apuntan a esa misma ruta.

### PDF recopilado del servicio

- Se genera un único PDF con **todos los trabajos del servicio que tengan
  evidencia aprobada**. Los trabajos sin fotos aprobadas no se incluyen.
- Se puede descargar directamente con **PDF del servicio** o incluir en el ZIP
  mediante la casilla **Incluir PDF recopilado por servicio**. Es independiente
  de la casilla de PDF por trabajo; si ambas están activas, se incluyen las dos.
- Estructura: portada, y una sección por trabajo. No tiene índice.
- La portada muestra contrato, servicio, edificio, fecha y resumen de trabajos y
  fotos incluidas.
- Cada trabajo empieza en una página nueva con su título; las páginas siguientes
  conservan la cabecera corrida.
- Se reutilizan los márgenes, el fondo del contrato, la rejilla de 4 fotos y las
  leyendas del PDF por trabajo.
- La numeración es global para todo el PDF; la portada no se numera.
- Si no hay ningún trabajo con evidencia aprobada, la descarga directa responde
  `409` y el ZIP no genera un PDF vacío.
- En el ZIP de contrato se genera un recopilado **por cada servicio** con
  evidencia aprobada, dentro de su carpeta de edificio/servicio.
- El registro XLSX **no cambia**: sigue mostrando una fila por trabajo y sus
  enlaces a los PDF por trabajo. El recopilado es solo un archivo adicional.

### Fondo del contrato

El administrador sube una imagen PNG/JPG de máximo 5 MB desde la ficha del
contrato. Se normaliza y se aplica a los PDF de todos sus servicios. Puede
reemplazarse o quitarse. En la misma tarjeta se configuran los márgenes.

## 6. Opciones del modal

El modal de exportación permite:

- elegir variante `Simple` o `Extendida`;
- incluir o no el registro XLSX;
- incluir o no las carpetas de fotografías;
- incluir o no los PDF por trabajo;
- en servicio y contrato, incluir o no el PDF recopilado por servicio;
- en contrato, incluir o no los servicios en espera, inactivos y archivados;
- exigir al menos un contenido;
- recordar la última elección en el dispositivo.

Las dos casillas de PDF son independientes. Si ambas están activas, el ZIP
contiene los PDF por trabajo y los recopilados; no existe una opción «Ambos».

Sin fotografías, los PDF por trabajo se colocan en la carpeta del servicio. Si no
se incluye ningún PDF ni XLSX, el ZIP solo contiene fotos.

## 7. Generación y seguridad

- Los ZIP se generan en streaming o con temporales acotados; nunca se carga el
  ZIP completo en RAM.
- Los temporales se eliminan aunque el cliente interrumpa la conexión.
- Los paths se derivan de IDs y nombres saneados; se protege contra traversal,
  ZIP Slip y colisiones.
- Los nombres repetidos se desambiguan con identificadores cortos seguros.
- El XLSX neutraliza valores que comiencen por `=`, `+`, `-`, `@` o caracteres de
  control si algún día se admiten datos de usuario.
- Toda exportación comprueba permisos en servidor y no modifica registros.
- Cloudflare corta a los 100 s en planes Free/Pro; las exportaciones muy grandes
  pueden requerir un subdominio sin proxy o dividir el ámbito.
