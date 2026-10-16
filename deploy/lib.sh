#!/usr/bin/env bash
#
# Helpers compartidos por `install.sh` y `deploy/*.sh`.
# Se asume que el directorio de trabajo es la raíz del repositorio (donde está `.env`).

# Lee una clave de `.env` (vacío si no existe).
lumen_env_value() {
	sed -n "s/^$1=//p" .env 2>/dev/null | tail -n1
}

# Secreto aleatorio en hexadecimal.
lumen_random_secret() {
	if command -v openssl >/dev/null 2>&1; then
		openssl rand -hex 24
	else
		LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 48
	fi
}

# sha256 de un archivo.
lumen_sha256() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	else
		shasum -a 256 "$1" | awk '{print $1}'
	fi
}
