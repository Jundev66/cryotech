import { z } from 'zod';

/**
 * The parts of a Telegram Update we act on.
 *
 * Every object is `passthrough`: Telegram adds fields to this payload
 * constantly, and a schema that stripped them would quietly discard whatever
 * the next feature arrives on. This validates the shape we depend on and lets
 * the rest travel untouched.
 */
const chatSchema = z.object({ id: z.number() }).passthrough();
const senderSchema = z.object({ id: z.number() }).passthrough();

const messageSchema = z
  .object({
    message_id: z.number(),
    chat: chatSchema,
    from: senderSchema.optional(),
    text: z.string().optional(),
    /** Every size Telegram kept, smallest first. */
    photo: z.array(z.object({ file_id: z.string() }).passthrough()).optional(),
    document: z
      .object({ file_id: z.string(), mime_type: z.string().optional() })
      .passthrough()
      .optional(),
    /** A Mini App submission: `data` is whatever the page passed to sendData. */
    web_app_data: z
      .object({ data: z.string(), button_text: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const callbackQuerySchema = z
  .object({
    id: z.string(),
    data: z.string().optional(),
    from: senderSchema,
    message: z.object({ chat: chatSchema }).passthrough().optional(),
  })
  .passthrough();

export const telegramUpdateSchema = z
  .object({
    update_id: z.number().int(),
    message: messageSchema.optional(),
    callback_query: callbackQuerySchema.optional(),
  })
  .passthrough();

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
export type TelegramMessage = z.infer<typeof messageSchema>;
