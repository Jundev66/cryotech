---
name: cryotech-domain
description: Domain knowledge for CryoTech poultry management system. Bounded contexts, aggregates, business rules, breed standards, and metrics for aviculture. Use when working on domain logic, schemas, or business rules.
---

# CryoTech Domain

> Conocimiento del dominio avícola para el sistema CryoTech.

## Bounded Contexts

| Context | Responsabilidad | Entidades |
|---------|----------------|-----------|
| **Breeding** | Gestión de lotes y crianza diaria | Batch, DailyLog |
| **Finance** | Control financiero por lote | Transaction |
| **Analytics** | Métricas, gráficas, reportes | Read models |
| **Identity** | Autenticación, granjas, usuarios | Farm, User |

## Database Schema

### farms
```sql
CREATE TABLE farms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### batches
```sql
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  breed TEXT NOT NULL,               -- Cobb 500, Ross 308, Hubbard
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  initial_quantity INTEGER NOT NULL CHECK (initial_quantity > 0),
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned','breeding','for_sale','finished')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### daily_logs
```sql
CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE NOT NULL,
  log_date DATE DEFAULT CURRENT_DATE,
  feed_consumed_kg DECIMAL CHECK (feed_consumed_kg >= 0),
  mortality INTEGER DEFAULT 0 CHECK (mortality >= 0),
  average_weight_g DECIMAL CHECK (average_weight_g > 0),
  temperature_c DECIMAL,
  humidity_pct DECIMAL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id, log_date)
);
```

### transactions
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  category TEXT NOT NULL CHECK (category IN ('feed','vaccine','sale','utility','other')),
  amount DECIMAL NOT NULL CHECK (amount >= 0),
  description TEXT,
  transaction_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Batch Status Lifecycle

```
planned → breeding → for_sale → finished
```

| Transition | Trigger |
|-----------|---------|
| planned → breeding | Start date reached, pollos recibidos |
| breeding → for_sale | Peso objetivo alcanzado (~5 semanas) |
| for_sale → finished | Todos vendidos o lote cerrado |

**Invalid transitions:** No se puede regresar de estado. Un batch `finished` es read-only.

## Business Rules

1. **Mortalidad diaria** no puede exceder pollos vivos: `mortality <= initial_quantity - sum(previous_mortalities)`
2. **Registro diario único** por lote por fecha (UNIQUE constraint)
3. **Batch cerrado** no acepta nuevos daily_logs ni transactions
4. **Peso promedio** debe ser positivo y razonable (< 10,000g para broilers)
5. **Consumo de alimento** proporcional a cantidad de pollos vivos

## Breed Standards

| Breed | Week 1 (g) | Week 2 (g) | Week 3 (g) | Week 4 (g) | Week 5 (g) | Target FCR |
|-------|-----------|-----------|-----------|-----------|-----------|-----------|
| **Cobb 500** | 185 | 460 | 950 | 1,580 | 2,350 | 1.65-1.75 |
| **Ross 308** | 180 | 450 | 920 | 1,520 | 2,250 | 1.60-1.70 |
| **Hubbard** | 170 | 430 | 880 | 1,450 | 2,150 | 1.70-1.80 |

## Key Metrics

| Metric | Formula | Good | Bad |
|--------|---------|------|-----|
| **FCR** | Total feed (kg) / Total weight gain (kg) | < 1.8 | > 2.2 |
| **Mortality %** | (Deaths / Initial) × 100 | < 3% | > 5% |
| **Daily gain (g)** | (Weight today - Weight yesterday) | On curve | Below curve |
| **Cost per kg** | Total expenses / Total weight produced | Depends on market | — |
| **Revenue per bird** | Total income / Birds sold | > cost per bird | < cost per bird |

## Zod Schemas

```typescript
import { z } from 'zod';

export const batchSchema = z.object({
  breed: z.string().min(1, 'Raza es requerida'),
  startDate: z.string().date(),
  initialQuantity: z.number().int().positive('Cantidad debe ser positiva'),
  status: z.enum(['planned', 'breeding', 'for_sale', 'finished']).default('planned'),
  notes: z.string().optional(),
});

export const dailyLogSchema = z.object({
  batchId: z.string().uuid(),
  logDate: z.string().date(),
  feedConsumedKg: z.number().nonnegative().optional(),
  mortality: z.number().int().nonnegative().default(0),
  averageWeightG: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const transactionSchema = z.object({
  batchId: z.string().uuid(),
  type: z.enum(['income', 'expense']),
  category: z.enum(['feed', 'vaccine', 'sale', 'utility', 'other']),
  amount: z.number().nonnegative(),
  description: z.string().optional(),
  transactionDate: z.string().date().optional(),
});
```

## Ubiquitous Language

| Term (ES) | Term (EN) | Meaning |
|-----------|-----------|---------|
| Lote | Batch | Grupo de pollos criados juntos |
| Registro diario | Daily Log | Datos del lote en un día |
| Conversión alimenticia | FCR | Eficiencia alimento → peso |
| Mortalidad | Mortality | Pollos muertos |
| Galpón | Barn/House | Estructura de crianza |
| Raza | Breed | Variedad genética |
| Engorde | Broiler | Pollo para carne |
| Granja | Farm | Unidad de negocio (tenant) |
