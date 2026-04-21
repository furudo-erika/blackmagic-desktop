// Shared input validators. Keep rules identical everywhere an agent run
// can be launched so fixes land once (QA BUG-01).

// Accept bare hostnames like "acme.com" or "sub.acme.co.uk". Reject
// anything without a dot, with whitespace, or with scheme/path chunks.
export function isValidDomain(raw: string): boolean {
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d);
}

export function normaliseDomain(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  }
}
