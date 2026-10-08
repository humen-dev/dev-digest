const CLOSING = /\b(?:closes|fixes|resolves)\s+#(?<n>\d+)/i;
const ANY_REF = /#(?<n>\d+)/;

/** First `closes|fixes|resolves #N` over title then body; else the first `#N`; else null. */
export function findLinkedIssue(title: string, body: string | null): number | null {
  const texts = [title, body ?? ''];
  for (const re of [CLOSING, ANY_REF]) {
    for (const text of texts) {
      const n = re.exec(text)?.groups?.n;
      if (n !== undefined) return Number(n);
    }
  }
  return null;
}
