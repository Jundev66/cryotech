# Montar la demo pública

La demo es un entorno **aislado**: su propia base, su propia instancia de la API
y datos inventados. Nunca apunta a la granja real — cualquiera con el enlace
vería ventas, clientes y dinero de verdad.

```
Vercel (SPA)  ──rewrite /api──▶  Render (API de demo)  ──▶  Supabase (Postgres)
                                          ▲
                          GitHub Actions cada 6 h: borra y vuelve a sembrar
```

El repositorio ya trae las tres piezas de código: `vercel.json` con el rewrite,
`scripts/seed-demo.mjs` con la siembra y el reseteo, y
`.github/workflows/demo-reset.yml` con el cron. Lo que queda es lo que solo se
puede hacer desde los paneles.

---

## 1. Supabase — solo como Postgres

Aquí Supabase es **una base gestionada y nada más**: sin Auth, sin RLS, sin Edge
Functions. El aislamiento entre empresas de este proyecto vive en la aplicación
(`CompanyMembershipGuard` más el filtro por `companyId`), y eso no cambia porque
la base esté alojada en otro sitio. Conviene tenerlo claro para no contradecir lo
que dicen el README y `AGENTS.md`.

1. Crear un proyecto nuevo. Región cercana a la de Render (`ohio` → `East US`).
2. En **Connect**, copiar la cadena de conexión. **Importante:** hay varias y no
   sirven igual.
   - Las conexiones directas de Supabase son IPv6 en los proyectos nuevos, y
     Render no siempre tiene salida IPv6. Si la API no conecta, ese es el
     motivo, y no se arregla mirando la contraseña.
   - Usa la del **Session pooler**: es IPv4 y admite `prisma migrate deploy`.
     La de *transaction pooler* (6543) no sirve para migrar, porque Prisma usa
     sentencias preparadas.
3. Guardar esa cadena; es el `DATABASE_URL` del paso 2.

## 2. Render — segunda instancia de la API

**No reutilices el servicio de producción.** Es un servicio nuevo, con su propia
base, y sin nada del bot.

- Nombre: **`cryotech-demo-api`**. El `vercel.json` y el workflow de reseteo ya
  apuntan a `https://cryotech-demo-api.onrender.com`; si le pones otro nombre,
  cámbialo en los dos sitios.
- Runtime Docker, `apps/api/Dockerfile`, misma región que Supabase.
- Variables de entorno:

  | Variable | Valor |
  |---|---|
  | `DATABASE_URL` | la del session pooler de Supabase |
  | `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
  | `JWT_REFRESH_SECRET` | otro distinto |
  | `CORS_ORIGIN` | la URL de Vercel (no se usa por el rewrite, pero el arranque valida que sea una URL) |
  | `REGISTRATION_ENABLED` | `true` |
  | `EXCHANGE_RATE_FALLBACK` | `250` |
  | `BCV_URL` | *sin poner* |
  | `NODE_ENV` | `production` |

  **Nada del bot**: ni `TELEGRAM_BOT_TOKEN`, ni `META_*`, ni `BUFFER_*`, ni
  `ANTHROPIC_API_KEY`. Sin ellas cada transporte se queda inactivo y lo dice en
  el log, que es justo lo que quieres: nadie puede conducir el bot real desde la
  demo, y la demo no gasta tokens de nadie.

- `REGISTRATION_ENABLED=true` es deliberado y es la única diferencia real con
  producción: sin él nadie puede crearse una cuenta para probar. A cambio, la
  base se llena de cuentas — por eso el reseteo corre cada seis horas.

- Aplicar las migraciones una vez: desde la Shell de Render, o en local con el
  `DATABASE_URL` de Supabase:

  ```bash
  DATABASE_URL='<supabase>' pnpm --filter @cryotech/api exec prisma migrate deploy
  ```

## 3. Sembrar la demo

Con la API ya en pie:

```bash
DEMO_API_URL=https://cryotech-demo-api.onrender.com/api \
DEMO_EMAIL=demo@cryotech.demo \
DEMO_PASSWORD='<la que publiques en el README>' \
node scripts/seed-demo.mjs
```

Crea el usuario la primera vez, y en cada pasada siguiente borra todas sus
empresas y vuelve a construir la granja: dos lotes —uno maduro con curva de peso
y consumos aprobados, otro recién empezado—, tres clientes, cuatro ventas en
distintos estados de cobro y dos cuentas de tesorería con movimientos.

## 4. Vercel

- Importar el repositorio. **Root Directory: la raíz**, no `apps/web` — el
  `vercel.json` de la raíz ya define `buildCommand` y `outputDirectory`.
- No hace falta ninguna variable de entorno: el destino de la API está en el
  rewrite.
- Con el primer despliegue, comprobar que `/api/health` responde `{"ok":true}`
  **a través del dominio de Vercel**. Si da 404, el rewrite no está aplicándose;
  si da 502, la API de Render está dormida o caída.

## 5. GitHub

- `Settings → Secrets and variables → Actions` → secreto **`DEMO_PASSWORD`**,
  con la misma contraseña del paso 3.
- Lanzar `Reset the demo` a mano una vez desde la pestaña Actions para comprobar
  que el cron funcionará.

## 6. README

Añadir el enlace con las credenciales y las tres advertencias honestas: que es un
entorno de juguete, que se borra y se vuelve a sembrar cada seis horas, y que la
primera carga puede tardar ~50 s porque el plan gratis de Render duerme el
servicio a los 15 minutos sin tráfico.

---

## Lo que hay que vigilar

**La primera carga es lenta.** Es lo primero que ve un reclutador. El Worker de
Cloudflare ya despierta la API de producción antes de sus crons
(`services/webhook-buffer/wrangler.toml`); añadir un cron que haga lo mismo con
la de demo cada 10 minutos la mantiene despierta durante el día.

**Una demo rota es peor que ninguna demo.** Si el free tier caduca o la base se
llena, el enlace del CV enseña un error. Merece la pena abrirla cada pocas
semanas.

**Nunca mezclar las dos.** Si alguna vez pones el `DATABASE_URL` real en el
servicio de demo para "probar algo", la demo pasa a publicar los libros de la
granja. Ese es el único error que no tiene vuelta atrás.
