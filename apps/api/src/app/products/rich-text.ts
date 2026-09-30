import sanitizeHtml from 'sanitize-html';
import { isRichText } from '@org/models/catalog';

const COLOUR = [
  /^#[0-9a-f]{3,8}$/i,
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i,
];
const TEXT_STYLES = {
  color: COLOUR,
  'background-color': COLOUR,
  'font-family': [/^[\w\s,'"-]{1,100}$/],
  'font-size': [/^\d{1,2}(\.\d+)?(px|pt|em|rem)$/],
};
const ALIGN = { 'text-align': [/^(left|right|center|justify)$/] };

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'h2',
    'h3',
    'h4',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'sub',
    'sup',
    'mark',
    'span',
    'blockquote',
    'pre',
    'code',
    'ul',
    'ol',
    'li',
    'hr',
    'a',
  ],
  allowedAttributes: {
    // target and rel are always overwritten by transformTags below.
    a: ['href', 'target', 'rel'],
    span: ['style'],
    mark: ['style', 'data-color'],
    p: ['style'],
    h2: ['style'],
    h3: ['style'],
    h4: ['style'],
    ol: ['start'],
  },
  allowedStyles: {
    span: TEXT_STYLES,
    mark: TEXT_STYLES,
    p: ALIGN,
    h2: ALIGN,
    h3: ALIGN,
    h4: ALIGN,
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      target: '_blank',
      rel: 'noopener noreferrer nofollow',
    }),
  },
};

/**
 * Keeps the formatting sellers can pick in the editor (fonts, sizes, colours,
 * alignment, lists, links) and drops everything else, such as scripts and event
 * handlers. Plain text descriptions are left as they are; React escapes them.
 */
export function sanitizeDescription(description: string): string {
  if (!isRichText(description)) return description;
  return sanitizeHtml(description, OPTIONS);
}
