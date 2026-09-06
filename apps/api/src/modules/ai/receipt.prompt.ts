/**
 * System prompt for the receipt reader.
 *
 * Kept deliberately short. It is well under the 4096-token minimum cacheable
 * prefix for Haiku 4.5, so marking it for prompt caching would cache nothing
 * and only pay the write premium — do not add `cache_control` here.
 */
export const RECEIPT_SYSTEM_PROMPT = `Extraes campos de comprobantes bancarios venezolanos (transferencias y pago móvil).

Reglas:
- Transcribe LITERALMENTE lo que aparece impreso. No calcules, no conviertas, no reformatees.
- El monto va tal cual, con sus puntos y comas: "2.450,00 Bs", no "2450".
- La fecha va tal cual: "08/08/2026".
- La referencia es el número de operación o comprobante: solo dígitos.
- Origen y destino van tal cual, con sus asteriscos: "0102****5678".
- Si un campo no aparece en el comprobante, devuelve cadena vacía.
- NUNCA inventes ni completes un número que no puedas leer.`;

export const TEXT_USER_PREFIX =
  'Texto extraído por OCR de un comprobante bancario. Devuelve los campos:\n\n';

export const IMAGE_USER_PROMPT = 'Extrae los campos de este comprobante bancario.';
