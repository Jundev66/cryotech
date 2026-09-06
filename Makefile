# CryoTech - Development Commands
# Usage: make <target>

# Todo target sin archivo va aquí. Un nombre declarado aquí sin receta Make lo
# da por hecho y sigue en silencio — así fue como `dev` pedía `dev-api` y
# `dev-web`, que no existen, y durante meses solo arrancó la base de datos.
.PHONY: help setup dev dev-bg api web stop stop-web stop-api stop-db stop-all \
        build build-types build-api build-web \
        db-migrate db-studio db-generate \
        docker-up docker-down \
        check check-api check-web clean logs logs-api install

# --- Help ---
help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

# --- Full Stack ---

setup: ## Base arriba, tipos compilados y migraciones aplicadas
	@docker compose up -d --wait postgres
	@echo "  ✓ postgres listo"
	@pnpm --filter @cryotech/shared-types build >/dev/null
	@echo "  ✓ shared-types compilado"
	@cd apps/api && pnpm exec prisma generate >/dev/null 2>&1
	@cd apps/api && pnpm exec prisma migrate deploy >/dev/null
	@echo "  ✓ migraciones al día"

dev: setup ## Levanta todo (db + api + web) en esta terminal
	@echo ""
	@pnpm dev

dev-bg: setup api web ## Levanta todo en segundo plano (te devuelve la terminal)
	@echo "API en :3011 · Web en :3002 — 'make stop' para detenerlas"

stop: stop-web stop-api ## Detiene api y web (la base sigue)

stop-all: stop-web stop-api stop-db ## Detiene todo, incluida la base

# --- Database ---
stop-db: ## Detiene PostgreSQL
	@docker compose down
	@echo "PostgreSQL detenido"

# --- Backend (NestJS) ---
api: setup ## Arranca la API en segundo plano (:3011)
	@cd apps/api && pnpm exec nest start --watch &
	@echo "API arrancando en :3011..."

stop-api: ## Detiene la API
	@-lsof -ti :3011 | xargs kill 2>/dev/null || true
	@echo "API detenida"

# --- Frontend (Vite) ---
web: setup ## Arranca la web en segundo plano (:3002)
	@cd apps/web && pnpm exec vite --host &
	@echo "Web arrancando en :3002..."

stop-web: ## Detiene la web
	@-lsof -ti :3002 | xargs kill 2>/dev/null || true
	@echo "Web detenida"

# --- Build ---
build: ## Compila todo
	@pnpm --filter @cryotech/shared-types build
	@pnpm --filter @cryotech/api exec nest build
	@cd apps/web && pnpm exec vite build

build-types: ## Compila solo shared-types
	@pnpm --filter @cryotech/shared-types build

build-api: ## Compila solo la API
	@pnpm --filter @cryotech/api exec nest build

build-web: ## Compila solo la web
	@cd apps/web && pnpm exec vite build

# --- Database ---
db-migrate: ## Crea y aplica una migración nueva
	@cd apps/api && pnpm exec prisma migrate dev

db-studio: ## Abre Prisma Studio
	@cd apps/api && pnpm exec prisma studio

db-generate: ## Regenera el cliente de Prisma
	@cd apps/api && pnpm exec prisma generate

# --- Verificación ---
# Necesitan la aplicación corriendo. El companyId sale de ASSISTANT_COMPANY_ID
# en apps/api/.env, así que no hay que pegar un UUID cada vez.

check: check-api check-web ## Corre todas las verificaciones

check-api: ## Las suites de la API
	@scripts/check-api.sh

check-web: ## Los tests E2E con Playwright
	@echo ""
	@echo "── Playwright"
	@cd apps/web && pnpm exec playwright test

# --- Docker (Production) ---
docker-up: ## Levanta todo con Docker Compose
	@docker compose up -d --build

docker-down: ## Detiene los servicios de Docker
	@docker compose down

# --- Utilities ---
clean: ## Borra los artefactos de compilación
	@rm -rf apps/api/dist apps/web/dist packages/shared-types/dist
	@rm -f apps/api/tsconfig.tsbuildinfo packages/shared-types/tsconfig.tsbuildinfo
	@echo "Artefactos borrados"

logs: ## Sigue los logs de Postgres
	@docker compose logs -f postgres

logs-api: ## Sigue los logs de la API en Docker
	@docker compose logs -f api

install: ## Instala las dependencias
	@pnpm install
