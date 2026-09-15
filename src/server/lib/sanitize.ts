import sanitizeHtml from 'sanitize-html';

/**
 * Attribute::StyleScrubber — the allow-list Rails used for rich-text profile
 * attributes written through Summernote.
 */
const PROFILE_TAGS = [
  'br', 'strong', 'em', 'b', 'font', 'p', 'table', 'tbody', 'tr', 'td', 'ol', 'li', 'u',
  'span', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'strike', 'hr',
];
const PROFILE_ATTRS = ['style', 'frameborder', 'width', 'height', 'color'];

/**
 * Port of Attribute#sanitize_text. Summernote emits `rgb(r, g, b)`, which the
 * Rails sanitiser dropped, so colours were rewritten to hex first — same here.
 */
export function sanitizeProfileHtml(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return value ?? null;
  const preSanitized = value.replace(
    /rgb\((\d+), ?(\d+), ?(\d+)\)/g,
    (_match, r: string, g: string, b: string) =>
      `#${[r, g, b].map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`,
  );
  return sanitizeHtml(preSanitized, {
    allowedTags: PROFILE_TAGS,
    allowedAttributes: { '*': PROFILE_ATTRS },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

/** ActionView `strip_tags`, used on intro message templates. */
export function stripTags(value: string | null | undefined): string {
  if (!value) return '';
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });
}

/** System messages are authored by us and contain intentional markup. */
const SYSTEM_TAGS = [...PROFILE_TAGS, 'a', 'img'];

export function sanitizeSystemHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: SYSTEM_TAGS,
    allowedAttributes: { '*': [...PROFILE_ATTRS, 'class'], a: ['href', 'target', 'rel', 'class'], img: ['src', 'class'] },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** ERB's `h` / Rails' implicit escaping. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** String#truncate(n) — Rails appends an ellipsis inside the limit. */
export function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 3))}...`;
}

/**
 * Message#format_content / Post#format_content: escape the user's text, then
 * turn bare http(s) links into anchors whose label is truncated to 50 chars.
 */
export function formatUserContent(content: string): string {
  const escaped = escapeHtml(content);
  return escaped.replace(/\bhttps?:\/\/[\w-]+\.\S+/g, (url) => {
    const unescapedHref = url.replace(/&amp;/g, '&');
    return `<a href="${unescapedHref}" target="_blank" rel="noopener noreferrer">${truncate(url, 50)}</a>`;
  });
}

/** ActionView `simple_format` without sanitising — newlines become paragraphs. */
export function simpleFormat(content: string): string {
  const paragraphs = content.split(/\n{2,}/).map((p) => p.replace(/\n/g, '<br />'));
  return paragraphs.map((p) => `<p>${p}</p>`).join('\n\n');
}
