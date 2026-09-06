FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
WORKDIR /app
# El package.json de la raíz entra aquí porque lleva `pnpm.overrides`, y esos
# overrides están grabados en el lockfile. Sin él pnpm calcula cero overrides,
# no coinciden con los once del lockfile, y la instalación congelada aborta con
# ERR_PNPM_LOCKFILE_CONFIG_MISMATCH. No es una dependencia del build: es parte
# de la definición del workspace.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
# packages/tsconfig no es una dependencia npm: shared-types lo alcanza por ruta
# relativa (`extends: "../tsconfig/base.json"`), y ahí es donde se fijan
# `target` y `lib` en ES2022. Sin este directorio tsc compila contra la
# librería ES5 por defecto y los tipos de zod fallan a cientos de errores
# sobre Map, Set y Symbol que no tienen nada que ver con el código.
COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api
RUN cd packages/shared-types && pnpm build
RUN cd apps/api && npx prisma generate && pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# La estructura del monorepo se conserva tal cual, y no es una preferencia de
# estilo: pnpm no copia paquetes dentro de cada node_modules, los llena de
# symlinks relativos que apuntan a un único almacén virtual en la raíz del
# workspace (/app/node_modules/.pnpm). `apps/api/node_modules/prisma` es un
# enlace que sube tres niveles.
#
# La versión anterior subía ese directorio a /app/node_modules por su cuenta,
# con lo que los 33 enlaces pasaban a resolver contra /node_modules/.pnpm, que
# no existe. La imagen se construía perfectamente y el contenedor moría en el
# primer require. Mover el WORKDIR a apps/api cuesta menos que aplanar el árbol
# y no puede desincronizarse.
#
# Owned by the unprivileged user the process runs as. Doing it in COPY avoids a
# second layer that duplicates node_modules just to chown it.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages/shared-types ./packages/shared-types
COPY --from=builder --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=node:node /app/apps/api/package.json ./apps/api/package.json

# The container held real credentials in its environment and spoke to the
# database with full privileges — running all that as root meant any code
# execution bug started with the ability to rewrite the image's own files.
# `node` ships with the base image.
USER node
WORKDIR /app/apps/api

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
