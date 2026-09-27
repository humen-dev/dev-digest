import { EXTERNAL_CONTENT_TYPES } from '../constants.js';

/**
 * Allowlist and content-type checks for intent's external-link source. The
 * actual request is the SSRF-safe `UrlFetcher` (`container.urlFetcher`); this
 * module only decides whether a URL/response is eligible to be used at all.
 */

/** True for an http(s) URL whose host is in `allowlist`, exactly or as a subdomain. */
export function isAllowlistedHost(url: string, allowlist: string[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return allowlist.some((h) => host === h || host.endsWith(`.${h}`));
}

/** True when the content-type (ignoring `;charset=...` etc.) is one intent can turn into text. */
export function isAcceptedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = contentType.split(';')[0]!.trim().toLowerCase();
  return (EXTERNAL_CONTENT_TYPES as readonly string[]).includes(base);
}

const BLOCK_TAG_RE = /<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_RE = /<[^>]+>/g;
const ENTITY_RE = /&(nbsp|amp|lt|gt|quot|#39|apos);/g;
const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
};

/** Drop `<script>`/`<style>`/`<noscript>` content, strip tags, decode basic entities, collapse whitespace. */
export function htmlToText(html: string): string {
  const withoutBlocks = html.replace(BLOCK_TAG_RE, ' ');
  const withoutTags = withoutBlocks.replace(TAG_RE, ' ');
  const decoded = withoutTags.replace(ENTITY_RE, (_m, name: string) => ENTITIES[name] ?? _m);
  return decoded.replace(/\s+/g, ' ').trim();
}
