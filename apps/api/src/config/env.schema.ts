import { z } from 'zod';

/**
 * Validates the environment before the app builds anything.
 *
 * A weak JWT secret is not a degraded mode — it is a total authentication
 * bypass, because anyone holding the secret can mint a token for any user. The
 * repository used to ship `change-me-access-secret-32chars` as a working
 * default in docker-compose.yml, which meant every deployment that did not
 * override it was forgeable by anyone who had read the repo. Failing the boot
 * is the only safe response: a process that starts is a process someone trusts.
 */

/** Long enough that brute-forcing the HMAC key is not the cheapest attack. */
const MIN_SECRET_LENGTH = 32;

/** Placeholders that ship in examples and must never reach a running process. */
const PLACEHOLDER = /change-me|your-.*-secret|secret-at-least|^changeme|^placeholder/i;

const secret = (name: string) =>
  z
    .string({ required_error: `${name} es obligatoria` })
    .min(MIN_SECRET_LENGTH, `${name} debe tener al menos ${MIN_SECRET_LENGTH} caracteres`)
    .refine((value) => !PLACEHOLDER.test(value), {
      message: `${name} sigue siendo un valor de ejemplo: genera uno con \`openssl rand -base64 48\``,
    });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3011),

    DATABASE_URL: z
      .string({ required_error: 'DATABASE_URL es obligatoria' })
      .url('DATABASE_URL debe ser una URL de conexión válida'),

    JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),
    JWT_ACCESS_EXPIRATION: z.string().default('15m'),
    JWT_REFRESH_EXPIRATION: z.string().default('7d'),

    // Exact origin, no wildcard: the API answers with credentials, and `*` is
    // rejected by browsers in that mode anyway.
    CORS_ORIGIN: z.string().url('CORS_ORIGIN debe ser un origen completo').default('http://localhost:3002'),

    // The buffer's pull token is a bearer credential; if it is set at all it has
    // to be long enough to be worth the name.
    BUFFER_PULL_TOKEN: z.string().min(MIN_SECRET_LENGTH).optional(),

    // The only thing standing between Telegram's webhook and anyone who knows
    // the URL. Unset means the endpoint answers 403 to everything, which is a
    // valid way to run without Telegram; set-but-short is not a valid anything.
    TELEGRAM_WEBHOOK_SECRET: z.string().min(MIN_SECRET_LENGTH).optional(),

    // Off unless explicitly enabled, and never in production: it disables
    // certificate verification on the request that prices the whole ledger.
    BCV_ALLOW_INSECURE_TLS: z.enum(['true', 'false']).default('false'),

    // No default on purpose: RegistrationEnabledGuard decides from NODE_ENV —
    // closed in production, open outside it — and a default here would erase
    // that asymmetry. What is validated is that, when set, it is one of the two
    // literals: `REGISTRATION_ENABLED=1` would leave sign-up open on the
    // internet while looking closed.
    REGISTRATION_ENABLED: z.enum(['true', 'false']).optional(),
  })
  // Everything else — Meta, Anthropic, assistant tuning — stays untouched and
  // is validated where it is used, by code that already handles it being absent.
  .passthrough()
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message:
          'JWT_REFRESH_SECRET no puede ser igual a JWT_ACCESS_SECRET: un access token robado valdría como refresh token',
      });
    }

    if (env.NODE_ENV === 'production' && env.BCV_ALLOW_INSECURE_TLS === 'true') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BCV_ALLOW_INSECURE_TLS'],
        message: 'BCV_ALLOW_INSECURE_TLS no puede estar activo en producción',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Hooked into `ConfigModule.forRoot({ validate })`, so this runs once at boot
 * and throws before a single module is instantiated.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  · ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida — la API no arranca:\n${detail}`);
  }

  return result.data;
}
