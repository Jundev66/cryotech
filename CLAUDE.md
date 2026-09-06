# CryoTech - Guía del Proyecto

> Sistema SaaS de gestión avícola para pequeños y medianos productores. Optimización de conversión alimenticia y trazabilidad total.

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Monorepo** | pnpm workspaces + Turborepo | pnpm 9.15 |
| **Backend** | NestJS | 11 |
| **ORM / DB** | Prisma + PostgreSQL | 6 / 16 |
| **Auth** | JWT propio (`@nestjs/jwt` + Passport) — **no Supabase** | — |
| **Frontend** | React + Vite (SPA, `react-router`) — **no Next.js** | 19 / 6 |
| **Estilos** | Tailwind CSS + Shadcn/UI | v4 |
| **Lenguaje** | TypeScript | 5.x |
| **State/Cache** | TanStack Query | v5 |
| **Validación** | Zod (compartido cliente/servidor) | 3.x |
| **Charts** | Recharts | — |
| **Bot** | Telegram Bot API (webhook directo) + WhatsApp Cloud API (Worker + buffer D1) | — |
| **OCR / IA** | Tesseract.js + Anthropic SDK | — |
| **Deploy** | Docker Compose (Postgres + API + nginx) | — |

## Arquitectura del Proyecto

```
cryotech/
├── apps/
│   ├── api/                        # NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Fuente de verdad del modelo
│   │   │   └── migrations/         # SQL versionado (migrate deploy)
│   │   └── src/
│   │       ├── config/env.schema.ts   # Validación de entorno al arrancar
│   │       ├── common/
│   │       │   ├── guards/         # jwt-auth, company-membership, permission
│   │       │   ├── decorators/     # CurrentUser, CurrentCompanyId, CurrentMember
│   │       │   ├── pipes/          # ZodValidationPipe
│   │       │   └── filters/        # HttpExceptionFilter (loguea 5xx/401/403)
│   │       ├── modules/            # Un módulo por agregado de negocio
│   │       │   ├── auth/           # Login, registro, rotación de refresh
│   │       │   ├── assistant/      # Núcleo del bot, agnóstico del canal
│   │       │   │   └── inbound/    # La costura: envelope, registro, orquestación
│   │       │   ├── telegram/       # Transporte Telegram + webhook
│   │       │   ├── whatsapp/       # Transporte Meta + poller del buffer
│   │       │   └── ...             # batches, sales, treasury, feed, …
│   │       └── main.ts             # helmet, CORS, trust proxy, body limits
│   └── web/                        # SPA React + Vite
│       ├── src/{api,pages,components,providers,hooks}/
│       ├── e2e/                    # Playwright
│       └── nginx.conf              # Cabeceras de seguridad + proxy /api
├── packages/
│   ├── shared-types/               # Schemas Zod y tipos compartidos
│   └── tsconfig/                   # Configuraciones base de TS
├── services/
│   ├── webhook-buffer/             # Cloudflare Worker + D1: cola de entrada
│   └── whatsapp-flows/             # Definiciones de formularios de Meta
└── scripts/                        # Seeds (credenciales por entorno)
```

**Dos canales, un asistente.** `assistant/` no importa ningún transporte:
`assistant/inbound/` define un `InboundEnvelope` que el transporte construye y
un `ChannelSender` en el que se registra al arrancar. La idempotencia, la lista
blanca, el reparto por tipo de mensaje y el agrupado de comprobantes viven una
sola vez, en `AssistantInboundService`. Un canal nuevo traduce y nada más.

**Por qué Telegram:** Meta no libera formularios nativos —ni un nombre
verificado— desde un negocio sin registro legal, y *Granja Mata* no lo tiene
(ver `services/whatsapp-flows/README.md`). El canal de WhatsApp además corre
sobre el número de prueba de Meta, que es reclamable. Telegram pide un token de
@BotFather y ya: sin ventana de 24 h, sin plantillas, sin tope de tres botones
ni de diez filas.

**Por qué el Worker solo para WhatsApp:** Meta necesita un endpoint HTTPS que
responda en segundos y verifique una firma HMAC sobre el cuerpo crudo. El
Worker recibe, verifica y encola en D1; la API **tira** de esa cola. Telegram no
lo necesita: se autentica con un secreto en cabecera, guarda lo no entregado
24 h por su cuenta, y la API ya tiene URL pública en Render (`render.yaml`).
Entrega directa en `/api/telegram/webhook`.

## Convenciones de Código

### Nomenclatura

| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| **Archivos/Carpetas** | kebab-case | `daily-log-form.tsx` |
| **Componentes** | PascalCase | `DailyLogForm` |
| **Hooks** | camelCase con `use` | `useDailyLogs` |
| **Schemas Zod** | camelCase + `Schema` | `dailyLogSchema` |
| **Types/Interfaces** | PascalCase | `DailyLog`, `BatchStatus` |
| **Constantes** | UPPER_SNAKE_CASE | `BATCH_STATUSES` |
| **Tablas SQL** | snake_case plural | `daily_logs` |
| **Columnas SQL** | snake_case | `feed_consumed_kg` |

### TypeScript

- **Strict mode** siempre habilitado
- Preferir `interface` sobre `type` para objetos
- Usar `as const` para literales
- No usar `any` — usar `unknown` si el tipo es desconocido
- Los tipos de la base salen del cliente de Prisma (`@prisma/client`);
  los de la API, de los schemas Zod en `@cryotech/shared-types`
- `z.infer` es el tipo de **salida** de un schema: un campo con `.default()`
  aparece como obligatorio. Para lo que *envía* un cliente va `z.input`
  (ver `ProcessingPayload` en `shared-types`)

### React (SPA con Vite)

- Todo es cliente: no hay Server Components ni Server Actions
- Los datos se piden con TanStack Query sobre `src/api/*.api.ts`
- El cliente axios (`src/api/client.ts`) inyecta `Authorization` y
  `X-Company-Id`, y refresca el token en el 401
- Rutas con `react-router`; los formularios con `react-hook-form` + `zodResolver`
  sobre los schemas de `@cryotech/shared-types`

### NestJS

- Un módulo por agregado; el controlador valida y delega, el servicio manda
- Orden de guards obligatorio: `JwtAuthGuard` → `CompanyMembershipGuard` →
  `PermissionGuard`
- El `companyId` se toma con `@CurrentCompanyId()`, nunca del cuerpo
- Toda mutación que toque varias tablas va en `prisma.$transaction`
- Migraciones: se escriben a mano y se aplican con `prisma migrate deploy`.
  **Nunca `migrate dev` contra datos reales** — puede resetear el esquema si
  detecta drift

### Estilos

- Tailwind v4 con `@theme` directive para design tokens
- Shadcn/UI como base de componentes
- Mobile-first responsive design
- Dark mode con `class` strategy
- No usar `@apply` innecesariamente — preferir componentes React

## Modelo de Dominio

### Entidades Principales

| Entidad | Tabla | Descripción |
|---------|-------|-------------|
| **Company** | `companies` | Empresa/tenant. Todo cuelga de aquí |
| **CompanyMember** | `company_members` | Quién pertenece a qué empresa, con qué rol |
| **Role** | `roles` | Permisos por módulo y acción, en JSON |
| **Warehouse** | `warehouses` | Galpón donde vive un lote |
| **Batch** | `batches` | Lote de pollos con raza, cantidad, fechas |
| **DailyLog** | `daily_logs` | Registro diario: consumo, mortalidad, peso |
| **Sale** / **SalePayment** | `sales`, `sale_payments` | Venta y sus cobros |
| **Transaction** | `transactions` | Ingresos y gastos, en Bs |
| **Account** / **Movement** | `accounts`, `account_movements` | Tesorería multi-moneda |
| **ProductEntry** | `product_entries` | Compras de insumos y lo que se debe por ellas |

### Ciclo de Vida del Lote

```
planned → breeding → for_sale → finished
```

| Estado | Significado |
|--------|------------|
| `planned` | Lote planificado, aún no iniciado |
| `breeding` | En crianza activa, registros diarios |
| `for_sale` | Pollos listos para venta |
| `finished` | Lote cerrado, solo lectura |

### Métricas Clave

| Métrica | Fórmula | Uso |
|---------|---------|-----|
| **FCR** | Alimento total (kg) / Peso total ganado (kg) | Eficiencia alimenticia |
| **Mortalidad %** | (Muertes / Cantidad inicial) × 100 | Salud del lote |
| **Curva de crecimiento** | Peso promedio vs días | Comparar con estándar de raza |
| **Costo por pollo** | Gastos totales / Pollos vivos en corral | Rentabilidad |

## Reglas de Negocio

1. Cada `company` tiene un `owner_id` (`users.id`) y su fila en `company_members`
   con `is_owner`; el propietario no se puede eliminar ni cambiarle el rol
2. Un `batch` siempre pertenece a una `company`
3. Los `daily_logs` son únicos por `batch_id` + `log_date`
4. Las `transactions` pueden ser `income` o `expense`
5. Un lote `finished` no acepta nuevos registros diarios
6. La mortalidad no puede exceder la cantidad viva restante
7. El peso promedio debe ser positivo
8. Las categorías de transacción: `feed`, `vaccine`, `chicks`, `sale_live`, `sale_dead`, `processing`, `utility`, `labor`, `transport`, `other`, `capital_in`, `owner_draw`

## Offline-First (PWA)

> Diseñado, **no implementado**: hoy no hay service worker ni persistencia de
> las queries. Lo de abajo es el plan, no el estado.

- Usar TanStack Query con persistencia en LocalStorage/IndexedDB
- Mutations optimistas con rollback en error
- Cola de sincronización para operaciones pendientes
- Service Worker para caché de assets estáticos
- Indicador visual de estado online/offline

## Comandos de Desarrollo

```bash
# Desarrollo (ver el Makefile: make help)
make setup                     # Postgres en Docker (:5434), tipos y migraciones
make api                       # NestJS en watch, puerto 3011
make web                       # Vite, puerto 3002

# Base de datos
pnpm db:generate               # Regenerar el cliente de Prisma
pnpm --filter @cryotech/api exec prisma migrate deploy   # Aplicar migraciones
pnpm db:studio                 # Prisma Studio

# Calidad
pnpm type-check                # TypeScript en todo el monorepo
pnpm lint                      # ESLint (flat config en la raíz, cubre todo)
pnpm test                      # Vitest: unidad, sin base de datos
pnpm audit --audit-level=high  # Dependencias vulnerables

# Testing
scripts/check-api.sh           # Todas las suites de la API
pnpm e2e                       # Playwright
services/webhook-buffer/scripts/check-worker.sh   # Worker contra wrangler dev
apps/api/scripts/check-telegram-e2e.sh            # Webhook de Telegram de punta a punta

# Telegram
scripts/telegram-set-webhook.sh          # Registrar el webhook (--info, --delete)

# Build
pnpm build                     # Todo el monorepo
```

> `prisma migrate dev` puede resetear el esquema si detecta drift. Contra la
> base con datos reales, siempre `migrate deploy` sobre una migración escrita
> a mano.

## Multi-Tenancy

El tenant es la **empresa** (`companies`), no la granja, y el aislamiento vive
en la aplicación — **no hay RLS**, porque no hay Supabase: la API habla con
PostgreSQL por Prisma con un único rol de base de datos.

- Toda tabla de negocio lleva `company_id` como foreign key
- El `company_id` llega en la cabecera `X-Company-Id` y lo valida
  `CompanyMembershipGuard`, que comprueba la membresía contra `company_members`
  antes de dejar pasar la petición
- Los servicios filtran **siempre** por `companyId` en el `where`; ese filtro es
  el único aislamiento que existe, así que omitirlo es una fuga, no un descuido
- Nunca tomar el `companyId` del cuerpo de la petición

## Seguridad

> Auditoría completa: 2026-08-09. Lo de abajo describe lo que hay implementado,
> no lo que sería deseable.

| Regla | Implementación |
|-------|---------------|
| **Auth** | JWT propio (`@nestjs/jwt` + Passport). Access token 15 min, refresh 7 días |
| **Contraseñas** | bcrypt cost 12. Mínimo 10 caracteres con mayúscula, minúscula y número |
| **Refresh tokens** | 256 bits aleatorios, guardados **hasheados** (SHA-256). Rotación con `familyId`: reusar uno ya rotado revoca toda la familia |
| **Autorización** | `JwtAuthGuard` → `CompanyMembershipGuard` → `PermissionGuard`, en ese orden. Permisos enumerados por módulo y acción, **sin comodín** |
| **Rate limiting** | `@nestjs/throttler` global (120/min) y 5 intentos / 15 min en `/auth/login` y `/auth/register` |
| **Input validation** | Zod en cliente y servidor. Todo `@Body()` pasa por `ZodValidationPipe`, salvo el webhook de Telegram, que valida con `safeParse()` a mano para poder responder 200 a una carga que no reconoce; con un 400, Telegram reintenta la misma actualización sin parar |
| **Cabeceras** | `helmet` en la API; CSP, HSTS, `X-Frame-Options` y `Referrer-Policy` en `apps/web/nginx.conf` |
| **CORS** | Origen exacto desde `CORS_ORIGIN`, validado al arrancar. Sin comodines |
| **XSS** | React escapa por defecto; no se usa `dangerouslySetInnerHTML` en ningún sitio |
| **SQL Injection** | Prisma parametriza. No se usa `$queryRaw` ni `$executeRaw` |
| **Secrets** | Variables de entorno con permisos `600`, validadas al arrancar (`src/config/env.schema.ts`). El arranque falla si un secreto es corto o es un placeholder |
| **Webhooks** | El Worker de Cloudflare verifica la firma HMAC de Meta en tiempo constante y exige `PULL_TOKEN` para drenar la cola. El webhook de Telegram compara `X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_WEBHOOK_SECRET`, también en tiempo constante; sin el secreto configurado responde 403 a todo |
| **Quién puede operar** | Lista blanca por canal (`ASSISTANT_ALLOWED_PHONES`, `ASSISTANT_ALLOWED_TELEGRAM_IDS`) validada en `assistant/inbound/identity.service.ts`. Un remitente desconocido no recibe respuesta: el silencio no confirma que la cuenta existe |
| **CI** | `.github/workflows/security.yml`: `pnpm audit`, gitleaks, type-check, lint y pruebas unitarias en cada PR |

### Reglas al escribir código

1. Un endpoint nuevo lleva los tres guards y su `@RequirePermission`
2. Un `@Body()` sin `ZodValidationPipe` es un bug, no un atajo
3. Ninguna consulta de negocio sin `companyId` en el `where`
4. Ningún secreto en el repositorio: van a `.env` (gitignored) y a
   `wrangler secret put` para el Worker
5. Los scripts de `scripts/` leen credenciales del entorno, nunca literales

## Flujo de Desarrollo

```
1. Schema   → Definir/modificar schema Zod
2. Database → Crear migración SQL + actualizar tipos
3. Backend  → Server Action o API route
4. Frontend → Componente con form/tabla/chart
5. Test     → Unit test + integration test
6. PWA      → Verificar funcionamiento offline
```

## Modo Operativo — Registro de Operaciones de Negocio

Cuando el usuario describa una operación de negocio en el chat (venta, cobro, cliente nuevo, ajuste de inventario), ejecutarla **inmediatamente** en la base de datos con `psql` usando los IDs reales. **Nunca generar scripts con placeholders** (`<COMPANY_ID>`, `<BATCH_ID>`, etc.).

### Datos constantes (no preguntar)

| Dato | Cómo obtenerlo |
|------|----------------|
| `company_id` | Buscar por el email del propietario (`<email del propietario>`) vía `companies + company_members` — una vez por sesión, reutilizar |
| `exchange_rate` | Scrapear directamente el sitio oficial del BCV con este comando exacto — **no usar `ve.dolarapi.com`** (tiene retraso de hasta 5 Bs/USD y genera pérdidas reales):<br>`curl -s "https://www.bcv.org.ve/" -A "Mozilla/5.0" -L \| python3 -c "import sys,re; html=sys.stdin.read(); b=html[html.find('id=\"dolar\"'):html.find('id=\"euro\"')]; m=re.search(r'strong-tb[^>]*>([0-9]+,[0-9]+)',b); print(m.group(1).replace(',','.')) if m else None"` |
| Precios en Bs | `ROUND(usd * bcv_rate, 2)` — calcular siempre, nunca pedir al usuario |

### Datos a resolver antes de registrar

**Venta (`sales`)**

| Campo | Cómo resolverlo |
|-------|----------------|
| `batch_id` | Lotes activos (`status IN ('breeding','for_sale')`) con `current_quantity >= quantity`. Si hay más de uno con stock suficiente → preguntar cuál. |
| `client_id` | Buscar por nombre (`ILIKE '%nombre%'`). Si no existe → crear automáticamente. Si hay más de una coincidencia → preguntar. |
| `sale_type` | `live` = pollo vivo · `dead` = beneficiado. Inferir del contexto; preguntar solo si es ambiguo. |
| `quantity` | Extraer del mensaje. Si no se menciona → preguntar. |
| `weight_kg` | Peso total en kg. Si no se menciona → preguntar. |
| `price_per_kg` | Precio estándar **$4.00/kg**. Usar otro solo si el usuario lo indica. |
| `total_amount` | `ROUND(weight_kg * price_per_kg, 2)` |
| `payment_status` | `pending` si es fiado · `paid` si paga al momento |
| `sale_date` | Hoy, salvo que el usuario indique otra fecha |
| `code` | `sequence_counters` con `entity = 'sale'` |

**Cobro (`sale_payments` + `transactions`)**

| Campo | Cómo resolverlo |
|-------|----------------|
| `sale_id` | Ventas `pending/partial` del cliente buscando por nombre |
| `amount` (USD) | Si el usuario da Bs → `ROUND(bs / bcv_rate, 2)`. Si da USD → usar directo. |
| `amount_bs` | Si pagó en Bs → monto exacto dado. Si pagó en USD → `ROUND(usd * bcv_rate, 2)`. |
| `payment_status` | `paid` si `paid_amount + amount >= total_amount` · `partial` si no |
| `transaction.category` | `sale_live` si `sale_type = 'live'` · `sale_dead` si `sale_type = 'dead'` |
| `transaction.code` | `sequence_counters` con `entity = 'transaction'` |
| `transaction.amount` | Siempre en **Bs** (moneda primaria del sistema) |

**Cliente nuevo (`clients`)**

| Campo | Cómo resolverlo |
|-------|----------------|
| `name` | Nombre dado por el usuario |
| `code` | `sequence_counters` con `entity = 'client'`, o `NULL` si no existe ese contador |
| `updated_at` | `NOW()` |

### Cuándo preguntar antes de registrar

Solo consultar al usuario si:
- Hay **más de un lote activo** con stock suficiente y el contexto no aclara cuál
- El **nombre del cliente** coincide con más de un registro
- El **monto es ambiguo** (sin cifra concreta)
- La **fecha es distinta a hoy** y el usuario no la especificó

### Qué NO hacer

- No generar scripts `.sql` con placeholders — ejecutar directo con `psql`
- No pedir `company_id`, `batch_id` ni `exchange_rate` al usuario — resolverlos internamente
- No usar tasa paralela — siempre BCV oficial (`fuente: "oficial"`)

## Tone & Language

- **Código:** Inglés (variables, componentes, commits)
- **UI:** Español (labels, mensajes, tooltips)
- **Docs:** Español para docs internos, inglés para code comments
- **Commits:** Inglés, formato convencional (`feat:`, `fix:`, `chore:`)
