/**
 * The message the API sent, or a generic one when it sent none.
 *
 * The API takes the trouble to explain what happened — "Stock insuficiente de
 * Alimento: disponible 26, requerido 126" — and the UI threw it away to show
 * "Error al aprobar consumo", leaving the user knowing something failed and
 * not what to do.
 *
 * Nest returns `message` as text, or as a list when Zod validation collects
 * several field errors.
 */
export function apiMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;

  if (typeof message === 'string' && message.trim() !== '') return message;
  if (Array.isArray(message) && message.length > 0) return message.join(' · ');

  return fallback;
}
