# syntax=docker/dockerfile:1

# --- Dependencias -------------------------------------------------------------
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    PNPM_STORE_DIR="/pnpm/store"
RUN npm install --global pnpm@9.15.4
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

# --- Build --------------------------------------------------------------------
FROM deps AS build
# Origen público opcional para CSRF/URLs absolutas (ver vite.config.ts).
ARG ORIGIN
COPY . .
RUN pnpm build && pnpm prune --prod

# --- Runtime ------------------------------------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app

# La imagen de Node ya incluye el usuario sin privilegios `node` (uid 1000).
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts ./scripts

# Directorio del volumen persistente de fotos, escribible por `node`.
RUN mkdir -p /data/photos && chown -R node:node /data/photos
VOLUME ["/data/photos"]

USER node
EXPOSE 3000

CMD ["node", "build/index.js"]
