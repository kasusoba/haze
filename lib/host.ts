// Host normalization + match-pattern helpers.

/** Canonical key for storing user rules per site: hostname minus a leading www. */
export function hostKey(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

/** Does `hostname` fall under the given suffix (exact or subdomain)? */
export function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  const h = hostname.toLowerCase();
  const s = suffix.toLowerCase();
  return h === s || h.endsWith(`.${s}`);
}

/** Origin match pattern for an arbitrary site, e.g. https://example.com/* */
export function originPattern(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

/** Match pattern covering a hostKey and its subdomains, e.g. *://*.imdb.com/* */
export function originPatternForKey(key: string): string {
  return `*://*.${key}/*`;
}

/** Whether a URL is one Haze can run on at all (http/https only). */
export function isInjectableUrl(url: string | undefined): url is string {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}
