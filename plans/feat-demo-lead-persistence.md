# Plan de Arquitectura (SDD): Persistencia y Trazabilidad de Leads de Demostración

**Ticket:** `FEAT-DEMO-LEADS`  
**Estrategia:** Spec-Driven Development (SDD)  
**Alcance:** Base de Datos (Prisma/PostgreSQL) + Backend API (NestJS) + Frontend Web (ERP) + Frontend Mobile (PWA)

---

## 1. Diagnóstico y Entendimiento Funcional

### Situación Actual
1. **Pérdida de datos en ERP:** El formulario del modal de demo guardaba los datos en el `localStorage` del navegador del cliente y llamaba al backend sin enviarlos. Luego se intentó vincular el correo a los usuarios efímeros (`User`), pero estos usuarios demo están sujetos a purgas o expiración y no guardan teléfono, capacidad de aves ni canal de origen.
2. **Acceso ciego en PWA:** La PWA móvil permite entrar a la demo en "1-tap" sin solicitar ningún dato, impidiendo saber quién está probando la app ni cómo contactarlo.
3. **Ausencia de CRM/Leads en Base de Datos:** No existe ninguna tabla ni endpoint para almacenar prospectos interesados.

### Objetivo
Diseñar e implementar un sistema de **captura, persistencia y trazabilidad centralizada de leads** tanto para el ERP web como para la PWA móvil, garantizando que cada persona interesada quede registrada de forma permanente, segura y consultable por el administrador.

---

## 2. Modelo de Dominio y Base de Datos

### Entidad: `DemoLead` (Tabla SQL: `demo_leads`)
A nivel de plataforma SaaS, esta entidad no pertenece a ninguna empresa existente (`company_id` nulo o ausente), ya que representa a un **prospecto externo** antes de contratar el servicio.

```prisma
enum LeadSource {
  ERP_LANDING
  ERP_LOGIN
  PWA_MOBILE
}

enum LeadStatus {
  NEW         // Recién capturado
  CONTACTED   // Contactado por WhatsApp/correo
  QUALIFIED   // Demostró interés real / en evaluación
  CONVERTED   // Se convirtió en cliente activo
  DISCARDED   // No interesado / spam
}

model DemoLead {
  id           String      @id @default(uuid()) @db.Uuid
  fullName     String      @map("full_name") @db.VarChar(120)
  phone        String      @db.VarChar(30)
  email        String?     @db.VarChar(255)
  farmSize     String?     @map("farm_size") @db.VarChar(50)
  source       LeadSource  @default(ERP_LANDING)
  status       LeadStatus  @default(NEW)
  ipHash       String?     @map("ip_hash") @db.VarChar(64)
  notes        String?     @db.Text
  createdAt    DateTime    @default(now()) @map("created_at")
  updatedAt    DateTime    @updatedAt @map("updated_at")

  @@index([createdAt(sort: Desc)])
  @@index([email])
  @@index([phone])
  @@map("demo_leads")
}
```

### Invariantes de Negocio:
1. **Persistencia inmune al ciclo efímero:** La tabla `demo_leads` es permanente; el sweeper de demos (`DemoSweeperService`) **nunca** toca esta tabla.
2. **Teléfono / WhatsApp obligatorio:** Es el canal principal de venta avícola en la región (+58 / internacional). El correo es opcional pero recomendado.
3. **Deduplicación inteligente:** Si un mismo teléfono o correo solicita demo más de una vez, se actualiza el registro existente (`updated_at` y reincidencia) o se vincula sin duplicar descontroladamente.
4. **Protección contra abuso (Rate Limiting & Spam):** Throttle estricto en el endpoint público (máximo 5 solicitudes cada 15 min por IP).

---

## 3. Arquitectura Backend (NestJS)

### Módulo: `DemoLeadsModule`
- **Controlador Público:** `POST /api/demo/leads`
  - Protegido por Throttler global y específico.
  - Valida el payload con `ZodValidationPipe(createDemoLeadSchema)`.
  - Persiste el lead en `demo_leads`.
  - Automáticamente aprovisiona la sesión demo efímera de 2 horas (o devuelve el token) para no generar doble salto al usuario.
- **Controlador Privado / Backoffice:** `GET /api/demo/leads`
  - Requiere autenticación `JwtAuthGuard` y rol de Propietario / SuperAdmin (`juan@cryotech.com`).
  - Permite listar leads con paginación, filtros por fecha, fuente (`ERP` vs `PWA`) y estado.
- **Acción Rápida de Contacto:** `PATCH /api/demo/leads/:id/status` para marcar como `CONTACTED`, `QUALIFIED`, etc.

---

## 4. Integración Frontend (Web ERP & Mobile PWA)

### En el ERP Web (`apps/web`):
1. **Modal de Captura Unificado:** `DemoLeadModal`:
   - Campos:
     - Nombre completo o de la granja (Obligatorio).
     - WhatsApp / Teléfono (Obligatorio, con selector/código de país).
     - Correo electrónico (Opcional).
     - Escala / Capacidad de aves (Selector amigable: 500-2k, 2k-10k, etc.).
   - Al enviar:
     - Envía a `POST /api/demo/leads` con `source: 'ERP_LANDING'` o `'ERP_LOGIN'`.
     - Recibe los tokens de acceso a la demo e ingresa automáticamente al Dashboard con mensaje de bienvenida personalizado.

### En la PWA Móvil (`apps/mobile`):
1. **Captura previa al ingreso:**
   - En lugar del botón ciego de 1-tap, al pulsar "Probar Demo" se despliega un formulario ágil optimizado para móvil (Bottom Sheet o Modal touch):
     - Nombre y WhatsApp (con opción rápida de omitir si se desea evaluar conversión de anónimos vs identificados).
     - Registra el lead con `source: 'PWA_MOBILE'`.
     - Procede al entorno demo temporal en terreno.

### Panel de Administración / Visualización de Leads:
- Crear una vista simple y elegante en el ERP para el administrador (`/admin/leads` o pestaña en Configuración/Dashboard para el dueño):
  - Tabla con: Fecha, Nombre, WhatsApp (con botón directo `Abrir chat de WhatsApp`), Correo, Tamaño de Granja, Canal (ERP vs Móvil) y Estado.

---

## 5. Plan de Verificación & QA
1. **Migración de base de datos:** Generar y aplicar migración SQL para la tabla `demo_leads` en Neon y local.
2. **Pruebas unitarias de API:** Validar schemas Zod, sanitización de datos y rate-limiting en NestJS.
3. **Prueba E2E de punta a punta:**
   - Simular envío desde ERP -> Verificar creación en `demo_leads` y login inmediato en la demo.
   - Simular envío desde PWA -> Verificar creación con `source: 'PWA_MOBILE'` y apertura de la sesión.
   - Verificar que el cron de purga (`DemoSweeperService`) no altere ni elimine ningún lead en `demo_leads`.
