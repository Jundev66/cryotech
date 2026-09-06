import { z } from 'zod';

/**
 * Password rules for new passwords only.
 *
 * `loginSchema` deliberately does NOT apply them: tightening the policy would
 * otherwise lock out every existing account whose password predates it, and a
 * length check on the way in tells an attacker which guesses are worth making.
 * Login validates that a password was sent, nothing more.
 */
const strongPassword = z
  .string()
  .min(10, 'Mínimo 10 caracteres')
  .max(128, 'Máximo 128 caracteres')
  .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
  .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
  .regex(/\d/, 'Debe incluir al menos un número');

/**
 * The email, normalized before it is validated.
 *
 * Postgres' unique index is case-sensitive, so without this `A@mail.com` and
 * `a@mail.com` are two accounts. Worse: whoever registered with a capital and
 * later typed it in lowercase got "invalid credentials" on their own account,
 * with no way out — there is no password recovery when the problem is that the
 * account you are looking for is not the one that exists.
 *
 * It lives in the shared schema so it holds on the form and in the API alike:
 * a phone keyboard capitalizes the first letter on its own.
 */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Correo electrónico inválido')
  .max(255);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'La contraseña es requerida').max(128),
});

export const registerSchema = z.object({
  fullName: z.string().min(2, 'Nombre debe tener al menos 2 caracteres').max(120),
  email,
  password: strongPassword,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

/**
 * Bounded so an oversized body cannot be used to probe the token lookup, and
 * because the token we issue is a fixed-length opaque string.
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken es requerido').max(512),
});

export const companySchema = z.object({
  name: z.string().min(2, 'Nombre de la empresa es requerido'),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const warehouseSchema = z.object({
  name: z.string().min(2, 'Nombre del galpón es requerido'),
  capacity: z.coerce.number().int().positive('Capacidad debe ser positiva').optional(),
  location: z.string().optional(),
});

/**
 * What a user may change about themselves.
 *
 * Deliberately narrow: `email` and `passwordHash` are not here, so a body
 * carrying either is rejected rather than quietly ignored. Changing an email is
 * an identity change and needs its own verified flow.
 */
export const userProfileUpdateSchema = z
  .object({
    fullName: z.string().min(2, 'Nombre debe tener al menos 2 caracteres').max(120).optional(),
    phone: z.string().max(30).optional(),
  })
  .strict();

/** Adding a member: an existing user's email plus, optionally, the role. */
export const memberAddSchema = z
  .object({
    // Same treatment as on registration: the email is looked up verbatim, so
    // inviting "Juan@mail.com" to someone stored in lowercase answered "no such
    // user" about an account that does exist.
    email,
    roleId: z.string().uuid('Rol inválido').optional(),
  })
  .strict();

export const memberUpdateSchema = z
  .object({
    roleId: z.string().uuid('Rol inválido').optional(),
  })
  .strict();

/**
 * The owner sets a new password for a member.
 *
 * There is no self-service by email because there is nowhere to send it, so
 * recovery is this: whoever runs the company changes it for the worker who
 * forgot it. Same rules as registration — a password assigned by someone else
 * is no reason for it to be weaker.
 */
export const memberPasswordSchema = z
  .object({
    password: strongPassword,
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type UserProfileUpdateInput = z.infer<typeof userProfileUpdateSchema>;
export type MemberAddInput = z.infer<typeof memberAddSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
export type MemberPasswordInput = z.infer<typeof memberPasswordSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type CompanyInput = z.infer<typeof companySchema>;
export type WarehouseInput = z.infer<typeof warehouseSchema>;
