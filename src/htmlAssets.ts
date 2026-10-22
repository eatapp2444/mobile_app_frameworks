import type { AppConfig } from './config';
import { homeHtml } from './home';

const FONT_HOST = /fonts\.googleapis\.com|fonts\.gstatic\.com/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;
const DEFAULT_BASE_URL = 'https://mobileforge-studio.lovable.app/';

export function isPrefetchableImage(url: string): boolean {
  if (!url || /^data:/i.test(url) || !/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    if (FONT_HOST.test(u.hostname)) return false;
  } catch {
    return false;
  }
  return IMAGE_EXT.test(url) || /\/wp-content\//i.test(url);
}

/**
 * WKWebView / Android WebView refuse to cache `source.html` loads when
 * `baseUrl` is empty. Use the first real https origin in the document
 * (skipping webfont CDNs), then a caller-supplied fallback such as
 * `webview.url`.
 */
export function resolveHtmlBaseUrl(html: string, fallback?: string | null): string {
  const re = /https:\/\/[^\s"'<>\\]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(html ?? '')))) {
    try {
      const u = new URL(m[0]);
      if (u.protocol === 'https:' && u.host && !FONT_HOST.test(u.hostname)) {
        return `${u.protocol}//${u.host}/`;
      }
    } catch {
      /* keep scanning */
    }
  }
  if (fallback) {
    try {
      const raw = /^https?:\/\//i.test(fallback) ? fallback : `https://${fallback}`;
      const u = new URL(raw);
      return `${u.protocol}//${u.host}/`;
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_BASE_URL;
}

function unique(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function urlsFromHtml(html: string): string[] {
  const found: string[] = [];
  const add = (url: string) => {
    if (isPrefetchableImage(url)) found.push(url);
  };
  const srcRe = /(?:src|data-src)=["'](https?:\/\/[^"']+)["']/gi;
  const cssRe = /url\(["']?(https?:\/\/[^"')]+)["']?\)/gi;
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(String(html ?? '')))) add(m[1]);
  while ((m = cssRe.exec(String(html ?? '')))) add(m[1]);
  return unique(found);
}

function walkImages(value: unknown, into: string[]) {
  if (!value) return;
  if (typeof value === 'string') {
    if (isPrefetchableImage(value)) into.push(value);
    else if (/<img\b/i.test(value) || /https?:\/\//i.test(value)) into.push(...urlsFromHtml(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkImages(item, into);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/html/i.test(key) && typeof child === 'string') {
        into.push(...urlsFromHtml(child));
      } else {
        walkImages(child, into);
      }
    }
  }
}

/** Absolute http(s) image URLs referenced by home + page HTML (and common image fields). */
export function collectPageImageUrls(config: AppConfig | null | undefined): string[] {
  if (!config) return [];
  const found: string[] = [];
  found.push(...urlsFromHtml(homeHtml(config)));
  for (const page of config.pages ?? []) {
    if (page.html) found.push(...urlsFromHtml(page.html));
    if (page.url && isPrefetchableImage(page.url)) found.push(page.url);
  }
  walkImages(config.home?.blank, found);
  walkImages(config.home?.sections, found);
  return unique(found);
}
