import type { ReplyButton } from '../assistant/types/assistant.types';

/**
 * How long a button label may get once its description is appended.
 *
 * Telegram wraps a long label over several lines rather than rejecting it, so
 * this is about staying readable, not about a limit.
 */
const MAX_LABEL = 96;

/**
 * How much text goes in one message.
 *
 * Telegram rejects anything over 4096 characters outright — the message is
 * lost, not truncated — so a long reply is split below that, leaving room for
 * the HTML tags the conversion adds.
 */
export const MAX_MESSAGE_CHARS = 4000;

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

/**
 * Rewrites the core's text as Telegram HTML.
 *
 * The assistant writes WhatsApp markup — `*bold*` and `_italic_` — because that
 * is the channel it was built for. Keeping the translation here rather than
 * neutralising the core means one channel's convention stays one channel's
 * problem.
 *
 * Escaping happens first. A client name with an ampersand in it would otherwise
 * arrive as a broken entity and Telegram would reject the whole message.
 */
export function toTelegramHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Bounded to a single line so an unpaired asterisk cannot swallow the rest of
  // the message looking for its partner.
  const bold = escaped.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
  // Only underscores at word edges open and close italics, so a code or a name
  // with one inside — "owner_draw", "ZZ_QE" — is left exactly as written.
  return bold.replace(/(^|[\s(>])_([^_\n]+?)_(?=$|[\s).,;:!?<])/gm, '$1<i>$2</i>');
}

/**
 * Splits a reply into messages Telegram will accept, on line breaks.
 *
 * Split before converting to HTML: the markup never spans lines, so cutting
 * between lines can never leave a tag open. A single line longer than the
 * limit is cut where it must be rather than dropped.
 */
export function splitMessage(text: string, max = MAX_MESSAGE_CHARS): string[] {
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  let current = '';

  for (const line of text.split('\n')) {
    const candidate = current === '' ? line : `${current}\n${line}`;
    if (candidate.length <= max) {
      current = candidate;
      continue;
    }

    if (current !== '') chunks.push(current);
    let rest = line;
    while (rest.length > max) {
      chunks.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    current = rest;
  }

  if (current !== '') chunks.push(current);
  return chunks;
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
  if (full.length <= MAX_LABEL) return full;
  // Cut by code points, not UTF-16 units: slicing in the middle of an emoji
  // leaves half a surrogate pair, which Telegram rejects.
  return `${Array.from(full).slice(0, MAX_LABEL - 1).join('')}…`;
}
