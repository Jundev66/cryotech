FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
# Igual que en apps/api/Dockerfile: shared-types extiende ../tsconfig/base.json
# por ruta relativa, así que ese directorio tiene que existir o tsc compila
# contra la librería ES5 por defecto.
COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared-types ./packages/shared-types
COPY apps/web ./apps/web
RUN cd packages/shared-types && pnpm build
RUN cd apps/web && pnpm build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
