# 06 — Plan de implementación, prioridades y criterios de aceptación

## 1. Propósito

Implementar Lumen **por entregas verticales verificables**, evitando que un agente construya una UI atractiva sobre reglas de permisos o estados incorrectas. Este plan es guía de ejecución, no un calendario obligatorio.

**Orden recomendado:** infraestructura y cuentas → modelo → servicios/catálogos → fotos → envíos/revisiones → historial → notificaciones → búsquedas/exports → endurecimiento/deploy. Mantener siempre migraciones y pruebas alineadas.

## 2. Definición de «terminado» transversal

Una función se considera terminada cuando:

1. Cumple las reglas de negocio y los permisos tanto en UI como en servidor.
2. Persiste de forma correcta y transaccional; maneja errores y concurrencia.
3. Incluye estados visuales de carga, vacío, fallo y, si aplica, conflicto.
4. Cuenta con pruebas adecuadas de comportamiento positivo, negativo y accesos indebidos.
5. Está documentada y funciona en entorno reproducible local con Docker.
6. No requiere servicios externos ajenos al stack acordado para sus funciones principales.

## 3. Etapa 0 — Proyecto y entorno reproducible

**Tareas**

- Inicializar Svelte 5 + SvelteKit + TypeScript estrictos, Tailwind y shadcn-svelte.
- Añadir lint/format/check, scripts de test y lockfile.
- Conectar PostgreSQL mediante Drizzle, declarar migraciones versionadas.
- Crear `Dockerfile` multi-stage (Node adapter), `compose.yaml`, `.env.example` y healthchecks.
- Configurar volumen SQL y volumen de fotos, usuario sin privilegios, logs.
- Añadir página de salud con verificación de DB y señal de configuración inicial.

**Aceptación**

- Una instalación nueva levanta app + DB con Compose y sin credenciales embebidas en imagen.
- Reiniciar los contenedores **no** elimina BD ni carpeta de fotos.
- Un despliegue sin migrar informa correctamente; migraciones aplican sin pérdida de datos.
- `.env.example` declara todas las variables, ninguna con secretos reales.

## 4. Etapa 1 — Identidad, sesiones, roles y asignaciones

**Tareas**

- Implementar `users`, `sessions`, `service_assignments` y protección del último admin.
- Primer arranque atómico para crear cuenta admin; login/logout, hashes de contraseña y cookies seguras.
- Middleware/server helpers para permisos y sesión activa en cada request.
- CRUD admin de usuarios, activación y cambios de rol con resolución de asignaciones incompatibles.
- Asignaciones por servicio (únicas activas), auditoría de cambios y revocación inmediata.

**Aceptación**

- Intentos simultáneos de primer arranque no generan dos cuentas iniciales.
- Admin puede crear técnico/supervisor; otros roles no pueden.
- Supervisor no asignado no lee un servicio aun con URL conocida.
- Desactivar usuario invalida el siguiente acceso de sesión abierta, preservando su historia.
- No puede desactivarse o degradarse al último administrador activo.
- Cambiar rol ajusta asignaciones incompatibles sin reescribir autores históricos.

## 5. Etapa 2 — Catálogos, servicios y trabajos

**Tareas**

- Implementar `catalogs`, `catalog_items`, `catalog_item_relations`, `services`, `works`, `elements` y `evidence_targets`.
- CRUD y relaciones entre ítems de catálogos diferentes, sin árbol universal obligatorio.
- CRUD servicios: nombre/descripción/edificio opcional, participantes, trabajos.
- Modo `direct`/`divided` con creación automática de **target correcto**, sin target del padre en `divided`.
- Nombres vinculados dinámicos y desvinculación al editar nombre individual.
- Eliminación de ítems con preservación de nombres en todas las instancias vinculadas.
- Generación masiva desde catálogos con **preview + excepciones por registro**.
- Progreso derivado y reglas de trabajos/servicios vacíos.

**Aceptación**

- Crear servicio con trabajo directo produce target directo sin elementos.
- Crear trabajo dividido con dos elementos produce dos targets y ninguno en trabajo padre.
- Servicio vacío y trabajo dividido vacío nunca se marcan completados/aprobados.
- Renombrar catálogo cambia instancias todavía vinculadas, pero no desvinculadas.
- Al borrar ítem, trabajos/elementos preservan nombre y no se pierde evidencia.
- Generación 34×4 crea estructura esperada sin confundir ítem maestro con instancia.
- Edición del edificio/nombre de servicio no modifica revisiones ni fotos.

## 6. Etapa 3 — Captura y almacenamiento fotográfico

**Tareas**

- Requisitos por target; obligatorios por defecto, opcionales y grupo virtual Adicionales.
- Subida múltiple con staging seguro, validación real de formato/tamaño, normalización/optimización y miniaturas.
- Almacenar fotos `ready`, actor, fecha, grupo, posición y versión de evidencia.
- Pantalla de captura con secciones plegables y previsualización; cámara/galería móvil.
- Retiro con soft removal y auditoría; reordenación solo dentro de grupo.
- Control de estado editable y concurrencia optimista para retiros/ordenación; append concurrente robusto.
- Editar requisitos solo antes de primera entrega (se probará plenamente al agregar etapa 4).
- Limpieza de temporales/archivos no referenciados.

**Aceptación**

- Varias fotos por requisito; cero máximos artificiales por cantidad.
- Carga simultánea de dos técnicos conserva ambas fotos y autores.
- Foto en grupo equivocado no tiene operación de «mover»; retirada y nueva subida.
- Reordenación obsoleta no pisa cambios ajenos: `409` claro.
- Formatos no soportados y archivos excesivos no se guardan como evidencia válida.
- No se puede descargar foto privada con URL sin permisos.
- Se puede continuar tras fallo aislado de una foto en lote, sin dar falso éxito.

## 7. Etapa 4 — Envíos, revisiones e historial inmutable

**Tareas**

- `evidence_submissions`, `submission_photos`, `reviews` con restricciones SQL y servicio de dominio.
- Validar requisitos y versión, congelar grupo/orden/IDs en snapshot transaccional.
- Envío con diálogo de confirmación y bloqueo global del objetivo `in_review`.
- Cola de revisión para supervisor asignado y admin; decisiones completas (no parciales).
- **Confirmación para aprobar y rechazar**; rechazo con motivo obligatorio.
- Revisión atómica: solo primera decisión; transición a `approved` o `rejected`.
- Reutilizar fotos del borrador tras rechazo y reenviar nueva entrega.
- Pestaña «Historial» de solo lectura separada de «Evidencia actual», fechas y autores.
- Congelar requisitos tras primer envío, incluso cuando esté rechazado.
- Proteger binarios usados históricamente frente a retiro del borrador vigente.

**Aceptación**

- No se puede enviar sin al menos una foto por requisito obligatorio.
- Si no hay requisitos obligatorios, exige al menos una foto total.
- Durante `in_review` y `approved`, mutaciones de fotos rechazan en servidor.
- Rechazar sin motivo no es posible; sin confirmar en UI no se envía decisión.
- Dos revisores concurrentes no crean decisiones dobles.
- Entrega #1 rechazada permanece intacta al retirar/agregar fotos y crear #2.
- La última aprobación bloquea ese objetivo; otros elementos del mismo trabajo siguen independientes.
- Historial muestra fotos y secciones originales aun si se cambió el borrador.
- Prueba de carrera: eliminar/subir/ordenar frente a submit siempre da snapshot consistente o `409`.

## 8. Etapa 5 — Cambios estructurales posteriores y destrucción explícita

**Tareas**

- Permitir crear/borrar trabajos/elementos en cualquier estado y recalcular agregados.
- Asistente `direct ↔ divided` únicamente sin envíos anteriores, con mapeo manual completo de fotos/requisitos.
- Bloquear cambios de requisitos tras primera entrega de target.
- Eliminar requisito antes de primer envío transfiriendo sus fotos a Adicionales.
- Eliminar servicio/trabajo/elemento con resumen de impacto y confirmación destructiva.
- Limpieza diferida de fotos que quedan sin referencias después de commit.

**Aceptación**

- Añadir elemento a trabajo dividido aprobado lo vuelve incompleto sin tocar decisiones anteriores.
- Eliminar trabajo aprobado actualiza el avance y no borra otros trabajos.
- Conversión con **cualquier** entrega histórica (rechazada o aprobada) es imposible.
- Conversión sin entregas requiere reasignar todas las fotos/requisitos o se cancela sin cambios.
- Borrar requisito preenvío mueve fotos a Adicionales preservando autoría.
- Borrado destructivo no puede hacerse sin confirmación y no deja referencias SQL inválidas ni fotos huérfanas indefinidamente.

## 9. Etapa 6 — Bandeja interna y Web Push

**Tareas**

- Crear notificaciones SQL idempotentes en transacción de envío/revisión.
- Bandeja con contador no leído, marcar individual/todas, enlaces autorizados.
- Suscripciones push por usuario/dispositivo, VAPID, service worker e instalación PWA.
- Enviar a todos los supervisores activos asignados tras envío; a todos los técnicos activos asignados tras revisión; no admins automáticamente.
- Gestionar suscripciones inválidas y errores sin revertir operaciones de evidencia.

**Aceptación**

- Nueva entrega genera inbox para supervisores asignados **y no** para supervisores ajenos.
- Aprobación/rechazo genera inbox para todos los técnicos asignados activos.
- Desactivar/desasignar antes del evento evita nuevas notificaciones para ese usuario.
- Si Web Push falla/está deshabilitado, entrega/revisión y bandeja permanecen exitosas.
- Clic en notificación después de revocación de acceso no permite leer el recurso.
- PWA muestra instrucciones de permiso, sin presuponer push universal.

## 10. Etapa 7 — Búsqueda y exportaciones

**Tareas**

- Búsqueda global por nombre visible actual en servicios/trabajos/elementos, filtrada por sesión, rol y asignaciones.
- Descarga de foto optimizada en evidencia actual e histórica.
- ZIP de entrega desde snapshot: requisitos, Adicionales, números en orden.
- ZIP de servicio: última entrega aprobada por target, jerarquía de carpetas y `resumen.csv` con omitidos.
- ZIP de contrato (`Contrato ▸ Edificio ▸ Servicio ▸ Trabajo ▸ (Elemento) ▸ Requisito`) y de trabajo (`Trabajo ▸ (Elemento) ▸ Requisito`), con la última entrega aprobada, más el **registro XLSX** (hoja `Resumen` + una por servicio, fila por trabajo, enlaces relativos al PDF de evidencia).
- Streaming o temporal controlado y nombres seguros para ZIP.

**Aceptación**

- Un técnico jamás encuentra un servicio ajeno en búsqueda ni por URL directa.
- El ZIP de Entrega #1 rechazada conserva sus fotos originales tras Entrega #2.
- ZIP de servicio incompleto contiene solo aprobados y relación de omitidos; nunca incluye un pendiente por error.
- ZIP respeta jerarquía directa vs dividida y foto por grupo/orden.
- Supervisor ajeno o técnico no puede descargar el ZIP de contrato/servicio/trabajo ni manipulando el endpoint.
- Nombres con tildes, barras o duplicados no provocan traversal ni colisión al exportar.
- Descargas grandes no disparan uso de RAM proporcional al peso total del ZIP.
- El XLSX abre en Excel/LibreOffice/Sheets; los enlaces relativos al PDF resuelven en Excel y LibreOffice (no en Google Sheets).

## 11. Etapa 8 — Calidad, operaciones y publicación

**Tareas**

- E2E móvil y escritorio, accesibilidad básica y evaluación de estados sin red.
- Revisión integral de permisos IDOR, CSRF, XSS, rate limits y validación de archivos.
- Restauración probada de BD y fotos, purga de staging y control de disco.
- Actualización de dependencias y versiones compatibles, lockfile, build reproducible.
- Documentar despliegue detrás de HTTPS, migraciones, VAPID, GHCR opcional, backup/restore.
- Publicar imagen GHCR versionada si el pipeline de repositorio lo permite.

**Aceptación**

- `check`, lint, tests y build pasan.
- Restauración de un conjunto de respaldo recupera historial, miniaturas y descargas.
- Caída de Postgres y de volumen de fotos se comunica sin confirmar operaciones incompletas.
- En teléfono instalado, cámara/galería, carga, revisión y búsqueda operan correctamente **con conexión**.
- Usuarios desactivados o sin asignación no extraen fotos vía miniaturas, ZIP ni enlaces antiguos.
- Las funciones core no dependen de servicios de terceros, aparte del canal estándar requerido por Web Push.

## 12. Matriz de pruebas obligatoria

| ID | Escenario | Resultado esperado |
|---|---|---|
| AUTH-01 | Técnico consulta servicio no asignado | Bloqueado en servidor |
| AUTH-02 | Supervisor intenta subir foto | Bloqueado |
| AUTH-03 | Admin revisa envío de cualquier servicio | Permitido |
| AUTH-04 | Desactivar usuario con sesión | Sesión inutilizable, autoría conserva |
| AUTH-05 | Desactivar/degradar último admin | Bloqueado |
| CAT-01 | Renombrar ítem maestro | Solo vinculados se actualizan dinámicamente |
| CAT-02 | Renombrar elemento individual vinculado | Se desvincula; no cambia con futuro ítem |
| CAT-03 | Borrar ítem usado por trabajos/edificio | Se conservan nombres y fotos |
| WORK-01 | Trabajo dividido vacío | No aprobado |
| WORK-02 | Agregar elemento a trabajo aprobado | Incompleto, aprobaciones intactas |
| WORK-03 | Conversión tras envío rechazado | Prohibida |
| WORK-04 | Conversión sin envío con fotos/requisitos | Todo se reasigna explícitamente o nada cambia |
| REQ-01 | Requisito requerido sin foto | Envío rechazado |
| REQ-02 | Sin requisitos obligatorios, 0 fotos | Envío rechazado |
| REQ-03 | Eliminar requisito antes de envío | Fotos pasan a Adicionales |
| REQ-04 | Editar requisitos después de primer envío | Prohibido |
| PHOTO-01 | Dos técnicos suben simultáneamente | Ambas fotos y autores preservados |
| PHOTO-02 | Cliente ordena versión vieja | `409`, sin sobrescribir |
| PHOTO-03 | Intentar mover foto de requisito | No existe operación permitida |
| PHOTO-04 | Retirar foto usada en entrega vieja | Foto histórica visible y descargable |
| SUB-01 | Envío mientras alguien edita | Snapshot consistente o conflicto |
| SUB-02 | Enviar por segunda vez en revisión | Bloqueado |
| REV-01 | Rechazo sin razón | Bloqueado |
| REV-02 | Dos supervisores revisan mismo envío | Exactamente una revisión |
| REV-03 | Rechazo → corrección → reenvío | Snapshots históricos distintos e inmutables |
| NOTIF-01 | Push falla | Bandeja/notificación interna y envío persisten |
| NOTIF-02 | Usuario no asignado abre deep link push viejo | Acceso bloqueado |
| EXP-01 | Exportar entrega histórica | Fotos y secciones del snapshot correcto |
| EXP-02 | ZIP servicio parcialmente aprobado | Incluye aprobados y enumera omitidos |
| EXP-03 | Técnico solicita ZIP de contrato/servicio/trabajo | Bloqueado (403) |
| SEARCH-01 | Buscar recurso no asignado | No aparece |
| DEL-01 | Borrar servicio con historial | Confirmación, cascada acotada y limpieza posterior |

Automatizar tantas pruebas como sea razonable. Para operaciones concurrentes, las pruebas deben usar **transacciones/sesiones reales de PostgreSQL**, no mocks que omitan locks.

## 13. Datos semilla y demostración

Solo para **desarrollo/pruebas**, nunca instalar datos ficticios por defecto en producción:

- Administrador, 2 supervisores y 4 técnicos con credenciales de entorno de desarrollo fáciles de resetear.
- Catálogos Edificios, Pisos y UMAs, relaciones de ejemplo.
- Un servicio con trabajo directo, otro con trabajo dividido, elementos pendientes, en revisión, rechazados y aprobados.
- Historias de envío con dos versiones y motivo de rechazo; fotos de prueba legítimas sin metadatos personales.
- Asignaciones cruzadas para probar que usuarios solo ven sus servicios.

Separar comando `seed:dev` explícito de `migrate`, `start` y primer arranque productivo. No generar usuarios predeterminados inseguro en producción.

## 14. Secuencia de validación manual para demostrar MVP

1. Instalar Compose en instancia vacía y registrar primer admin.
2. Crear técnicos/supervisores y dos servicios con asignaciones separadas.
3. Crear catálogo Pisos/UMAs; generar trabajos divididos y uno directo.
4. Renombrar un ítem vinculado, personalizar otro, borrar ítem y comprobar nombres.
5. Dos técnicos suben fotos a misma evidencia y simulan ordenación desactualizada.
6. Enviar Entrega #1, comprobar bloqueo, revisión y avisos.
7. Rechazar con motivo, modificar borrador, reenviar Entrega #2, aprobar.
8. Abrir historial #1 y comprobar que fotos/orden/motivo siguen exactamente iguales.
9. Aprobar elementos, completar trabajo/servicio y añadir nuevo elemento pendiente; comprobar recálculo.
10. Descargar foto, ZIP de entrega, ZIP de servicio y ZIP de contrato (solo aprobados).
11. Retirar asignación e intentar acceso a foto y ZIP usando enlace guardado: debe fallar.
12. Reiniciar contenedores y verificar fotos/BD; restaurar un respaldo de prueba.

## 15. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Corrupción de entrega por edición simultánea | Transacción, lock target y versión optimista |
| Borrado de foto histórica | Soft removal, FK `submission_photos`, limpieza por referencias |
| Fallos de subidas grandes | Staging, límites configurables, procesamiento aislado, mensajes y limpieza |
| Borrado de catálogo elimina trabajo | Desvinculación transaccional, sin cascada a evidencia |
| Estado aprobado falsamente tras edición de estructura | Recalcular al añadir/quitar trabajos/elementos; pruebas |
| Archivo accesible sin permiso | Endpoint autenticado, paths no públicos y pruebas IDOR |
| Dependencia de push de navegador | Inbox persistente como fuente fiable |
| Exportación pesada agota RAM/disco | Streaming/temporales, cuotas, limpieza ante desconexión |
| Pérdida de datos en despliegue | Volúmenes separados y respaldo coordinado BD+fotos |
| Requisitos contradicen snapshots | Congelación tras primer envío y snapshots de grupo/orden |

## 16. Decisiones técnicas ajustables vs requisitos fijos

**Ajustables durante desarrollo:** nombre exacto de rutas, IDs UUID/bigint, librería concreta de ZIP, layout de carpetas, pixelaje final de miniatura, límite de MiB por archivo, implementación de caché/inbox, estilos, duración de sesión, mecanismo concreto de semilla local, orden del menú.

**No ajustables sin acordarlo:** roles y alcance, trabajo directo/dividido, colaboración compartida, congelación de requisitos, no mover fotos entre grupos, entrega inmutable, confirmaciones en revisión, rechazo obligatorio con razón, conservación histórica, relación de catálogos y desvinculación, borrado destructivo administrativo confirmado, online-only v1, autohospedaje, stack esencial, descargas/ZIP, Web Push + inbox.

## 17. Lista de verificación para revisión final

- [ ] Todos los permisos de lectura, escritura, fotos, búsqueda y exportación se verifican en servidor.
- [ ] Dos técnicos pueden trabajar sin locks exclusivos y sin pisarse silenciosamente.
- [ ] Las fotos históricas no desaparecen al retirar fotos del borrador.
- [ ] Los snapshots registran grupo y orden exactos al enviar.
- [ ] El rechazo exige motivo; la UI confirma aprobación y rechazo.
- [ ] Requisitos bloqueados por **historia de envíos**, no por estado actual.
- [ ] Un trabajo dividido vacío y servicio vacío no aparecen completados.
- [ ] La estructura puede cambiar sin reescribir aprobaciones históricas.
- [ ] Borrar ítem catálogo nunca borra fotos; borrados destructivos sí requieren confirmación.
- [ ] ZIP de servicio solo incluye entregas aprobadas y reporta lo omitido.
- [ ] El ZIP de contrato agrupa por edificio y servicio, y no incluye objetivos no aprobados.
- [ ] Bandeja interna persiste sin Web Push y enlaces se reautorizan.
- [ ] Compose, migraciones, backups/restore y documentación son reproducibles.
