/**
 * Policy for CMS HtmlView (static page-builder HTML), not live Order/Account UrlViews.
 *
 * Android `LOAD_CACHE_ELSE_NETWORK` is safe for that HTML because it rarely
 * changes in-session. It must never be applied to UrlView — menus, prices and
 * logins would render stale.
 */
export const CMS_HTML_CACHE_MODE = 'LOAD_CACHE_ELSE_NETWORK' as const;

/** UrlView uses the WebView default (`LOAD_DEFAULT`) so Android revalidates. */
export const URL_VIEW_CACHE_MODE: undefined = undefined;

/** Synthetic origin used only when the app has no webview.url / domain. Not the CMS host. */
export const DEFAULT_HTML_BASE_URL = 'https://localhost/';

export function originFromUrl(url?: string | null): string | null {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.host) return null;
    // The CMS host requires a login — never use it as WKWebView's document origin.
    if (/mobileforge-studio\.lovable\.app/i.test(u.hostname)) return null;
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
}

/**
 * Document origin for `source.html` WebViews. Prefer the client's own site
 * (`webview.url`, then `app.domain`) — never "first https URL in the HTML",
 * which is often a 3rd-party embed or font CDN.
 */
export function resolveHtmlBaseUrl(input?: {
  webviewUrl?: string | null;
  siteUrl?: string | null;
  domain?: string | null;
} | null): string {
  return (
    originFromUrl(input?.webviewUrl) ??
    originFromUrl(input?.siteUrl) ??
    originFromUrl(input?.domain) ??
    DEFAULT_HTML_BASE_URL
  );
}

export function normalizeDocumentUrl(url: string): string | null {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    let path = u.pathname || '/';
    if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);
    return `${u.protocol}//${u.host}${path === '/' ? '/' : path}`;
  } catch {
    return null;
  }
}

/** iOS fires onShouldStartLoadWithRequest with `baseUrl` for the initial HTML document. */
export function isHtmlViewDocumentUrl(url: string, baseUrl: string): boolean {
  const a = normalizeDocumentUrl(url);
  const b = normalizeDocumentUrl(baseUrl);
  if (!a || !b) return false;
  return a === b;
}

export type HtmlViewNavDecision = 'allow' | 'block' | 'link' | 'web';

export function htmlViewNavDecision(
  url: string,
  baseUrl: string,
  opts: { isTopFrame?: boolean } = {},
): HtmlViewNavDecision {
  if (!url || url === 'about:blank' || url.startsWith('data:') || url.startsWith('file:')) return 'allow';
  // Initial document load (iOS): req.url === baseUrl. Must run before the https → /web rule.
  if (isHtmlViewDocumentUrl(url, baseUrl)) return 'allow';
  if (/^(tel:|mailto:|sms:)/i.test(url)) return 'link';
  if (/mobileforge-studio\.lovable\.app/i.test(url)) return 'block';
  if (/^https?:\/\//i.test(url) && opts.isTopFrame !== false) return 'web';
  return 'allow';
}

/** Android hardware back should walk WebView history before leaving the screen. */
export function shouldConsumeAndroidBack(canGoBack: boolean, enabled: boolean): boolean {
  return enabled && canGoBack;
}
