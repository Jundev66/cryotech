import type { ReplyButton } from '../assistant/types/assistant.types';

/**
 * How long a button label may get once its description is appended.
 *
 * Telegram wraps a long label over several lines rather than rejecting it, so
 * this is about staying readable, not about a limit.
 */
const MAX_LABEL = 96;

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

/**
 * Rewrites the core's text as Telegram HTML.
 *
 * The assistant writes WhatsApp markup — `*bold*` — because that is the channel
 * it was built for, and it is the only marker it uses: there is no `_italic_`
 * anywhere in the core, which is what makes this a two-line translation instead
 * of a parser. Keeping it here rather than neutralising the core means one
 * channel's convention stays one channel's problem.
 *
 * Escaping happens first. A client name with an ampersand in it would otherwise
 * arrive as a broken entity and Telegram would reject the whole message.
 */
export function toTelegramHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Bounded to a single line so an unpaired asterisk cannot swallow the rest of
  // the message looking for its partner.
  return escaped.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
}

/**
 * Renders the core's buttons as an inline keyboard, one per row.
 *
 * WhatsApp forced a choice here — three buttons or a ten-row list, never both —
 * and the core still paginates around that ceiling. Telegram has neither limit,
 * so every option the assistant offers is simply drawn.
 *
 * `description` has no home in an inline keyboard, so it is folded into the
 * label. On WhatsApp it was dropped outright whenever there were three or fewer
 * options; here nothing is lost.
 */
export function toInlineKeyboard(
  buttons: ReplyButton[],
  encode: (buttonId: string) => string,
): InlineKeyboardButton[][] {
  return buttons.map((button) => [
    {
      text: label(button),
      callback_data: encode(button.id),
    },
  ]);
}

function label(button: ReplyButton): string {
  const full = button.description ? `${button.title} · ${button.description}` : button.title;
  return full.length <= MAX_LABEL ? full : `${full.slice(0, MAX_LABEL - 1)}…`;
}
