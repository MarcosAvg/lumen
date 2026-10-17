# Operación, actualización y recuperación

> **Audiencia:** operación y soporte.
> **Estado:** vigente.
> **Fuente canónica de:** actualización, respaldo, restauración, mantenimiento,
> seguridad operativa y resolución de problemas.

La instalación inicial está en [`instalacion.md`](instalacion.md). Las variables
están en [`../referencia/variables-entorno.md`](../referencia/variables-entorno.md).

## 1. Actualización

```bash
./deploy/backup.sh              # 1. respaldar
docker compose pull             # 2. traer la imagen nueva
docker compose run --rm migrate # 3. migrar (idempotente)
docker compose up -d            # 4. recrear contenedores
```

El runner de migraciones usa un bloqueo de asesoría: dos despliegues solapados no
aplican dos veces la misma migración.

Comprobar después:

```bash
docker compose ps
docker compose logs --tail=100 app
curl -fsS https://tu-dominio/health
```

## 2. Web Push

Web Push forma parte del núcleo, pero su activación es opcional por dispositivo.
`install.sh` genera las claves; también se pueden generar a mano:

```bash
pnpm vapid:generate
```

Copiar el resultado en `.env` y recrear la app. La clave privada es un secreto:
no compartirla ni incluirla en imágenes.

Requisitos:

- HTTPS, que aporta Cloudflare.
- Permiso explícito del usuario.
- En iOS, añadir la PWA a la pantalla de inicio.

En **Ajustes** se activa el push por dispositivo y se envía una notificación de
prueba. Si push falla, la bandeja interna sigue funcionando.

## 3. Respaldos

Respaldar **juntos** PostgreSQL y el volumen de fotos:

```bash
./deploy/backup.sh
# ./backups/<fecha>/{db.dump,photos.tar.gz,manifest.json}

BACKUP_DIR=/mnt/backups ./deploy/backup.sh
```

- Solo necesita Docker, no Node.
- Usa `pg_dump --format=custom` y archiva el volumen de fotos.
- `manifest.json` incluye tamaño y `sha256` de cada archivo.
- Programar el respaldo con cron y verificar periódicamente que se genera.

No basta con respaldar solo la base o solo las fotos: las referencias entre
ambas se romperían.

## 4. Restauración

La restauración es destructiva y pide confirmación:

```bash
./deploy/restore.sh backups/<fecha>
docker compose restart app
```

Probar siempre primero en un entorno separado. Después de restaurar, verificar:

- recuento de fotos y miniaturas;
- historial de entregas y revisiones;
- descargas de fotos y ZIP;
- healthcheck y migraciones aplicadas.

## 5. Programar respaldo y limpieza

```cron
# Respaldo diario a las 03:00 y limpieza a las 04:00
0 3 * * * cd /opt/lumen && ./deploy/backup.sh >>/var/log/lumen-backup.log 2>&1
0 4 * * * cd /opt/lumen && docker compose exec -T app node scripts/cleanup.mjs >>/var/log/lumen-cleanup.log 2>&1
```

La limpieza purga temporales, archivos huérfanos y suscripciones push revocadas
con más de 30 días de antigüedad. Nunca borra archivos referenciados por
entregas.

## 6. Mantenimiento y observabilidad

```bash
docker compose exec app node scripts/cleanup.mjs
docker compose logs -f app
docker compose exec app node -e "fetch('http://127.0.0.1:3000/health').then(r => console.log(r.status))"
```

- `/health` responde `200` solo si la base responde y las migraciones están
  aplicadas; `503` en caso contrario.
- Se registran fallos de conversión, limpieza, base de datos, tiempos de ZIP y
  errores push.
- Revisar consumo de disco antes de que se llene el volumen de fotos.
- No ejecutar limpieza concurrente que pueda borrar archivos aún en uso.

## 7. Seguridad operativa

- Rate limiting en login, setup y subidas; es en memoria y por instancia.
- CSRF y verificación de `Origin` activos; no desactivarlos.
- Sesiones en cookies `HttpOnly`, `Secure` y `SameSite`; nunca en
  `localStorage`.
- Autorización de ámbito en cada lectura, descarga, búsqueda y ZIP.
- Validación de archivos por contenido (JPEG/PNG/WebP) y límites de tamaño y
  píxeles.
- PostgreSQL no se publica. La app no publica puertos en el host: se alcanza
  como `lumen:3000` en la red `proxy`.
- Contenedores como usuario sin privilegios, con `cap_drop: ALL` y
  `no-new-privileges`.
- Mantener la imagen y las dependencias actualizadas.

## 8. Resolución de problemas

| Síntoma | Causa probable o solución |
|---|---|
| `docker compose up` falla al traer la imagen | No hay imagen publicada: usar `docker compose pull` o `up --build` |
| La app no responde | `docker compose logs app`; comprobar que `db` está sana y `migrate` terminó |
| `EACCES` al subir fotos o fondos | El volumen o bind mount no es escribible por `node`; revisar propietario y permisos |
| `502` con el túnel | `cloudflared` no alcanza el origen; comprobar red `proxy` y destino `http://lumen:3000` |
| El dominio no abre | Revisar que el túnel apunta a `lumen:3000` y que `cloudflared` está activo |
| No se abre `http://127.0.0.1:8090` | La app no publica puertos; usar el túnel o añadir `ports` en un override local |
| `525` / «SSL handshake failed» | El servicio del túnel está en `https://` o el DNS apunta a un origen sin TLS; usar `http://` |
| `403` en formularios | `X-Forwarded-Proto` no llega como `https`; revisar la ruta del túnel |
| `500` «Address header…» | Falta `CF-Connecting-IP`; la petición no pasó por Cloudflare |
| `413` al subir fotos | Límite de Cloudflare (100 MB) o `BODY_SIZE_LIMIT` (30 MB) |
| `524` al exportar | Cloudflare corta a los 100 s; usar un subdominio sin proxy o dividir la exportación |
| La PWA no se actualiza | `/sw.js` cacheado; añadir regla de bypass en Cloudflare |
| Push no llega | Revisar claves VAPID y el sujeto `mailto:`; en iOS hace falta instalar la PWA |

### Ajustar límites de subida

`BODY_SIZE_LIMIT` está fijado en `compose.yaml` (30 MB) y debe superar
`MAX_UPLOAD_BYTES` (25 MiB por defecto). Para subir el límite:

1. Editar `BODY_SIZE_LIMIT` en el servicio `app` de `compose.yaml` o en un
   override local.
2. Ajustar `MAX_UPLOAD_BYTES` en el entorno si se quiere un límite de archivo
   distinto.
3. Recrear la app con `docker compose up -d`.
4. Tener en cuenta el límite de Cloudflare (100 MB).

Véase [`../referencia/variables-entorno.md`](../referencia/variables-entorno.md).
