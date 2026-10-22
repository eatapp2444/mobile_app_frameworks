import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CMS_HTML_CACHE_MODE,
  DEFAULT_HTML_BASE_URL,
  URL_VIEW_CACHE_MODE,
  htmlViewNavDecision,
  isHtmlViewDocumentUrl,
  resolveHtmlBaseUrl,
  shouldConsumeAndroidBack,
} from './htmlViewPolicy';

test('baseUrl comes from webview.url / app.domain, not the first https URL in HTML', () => {
  assert.equal(
    resolveHtmlBaseUrl({ webviewUrl: 'https://domenicospizza.com.au/menu' }),
    'https://domenicospizza.com.au/',
  );
  assert.equal(
    resolveHtmlBaseUrl({ domain: 'domenicospizza.com.au' }),
    'https://domenicospizza.com.au/',
  );
  // A 3rd-party embed must not win just because it appears first in the HTML.
  assert.equal(
    resolveHtmlBaseUrl({ webviewUrl: 'https://domenicospizza.com.au' }),
    'https://domenicospizza.com.au/',
  );
  assert.notEqual(
    resolveHtmlBaseUrl({ webviewUrl: 'https://domenicospizza.com.au' }),
    'https://www.youtube.com/',
  );
});

test('fallback baseUrl is localhost, never the blocked CMS host', () => {
  assert.equal(resolveHtmlBaseUrl({}), DEFAULT_HTML_BASE_URL);
  assert.equal(DEFAULT_HTML_BASE_URL, 'https://localhost/');
  assert.equal(resolveHtmlBaseUrl({ webviewUrl: 'https://mobileforge-studio.lovable.app/app' }), DEFAULT_HTML_BASE_URL);
  assert.doesNotMatch(resolveHtmlBaseUrl(null), /lovable/);
});

test('LOAD_CACHE_ELSE_NETWORK is CMS HtmlView only — UrlView must revalidate', () => {
  assert.equal(CMS_HTML_CACHE_MODE, 'LOAD_CACHE_ELSE_NETWORK');
  assert.equal(URL_VIEW_CACHE_MODE, undefined);
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'HtmlView.tsx'), 'utf8');
  const urlView = src.slice(src.indexOf('export function UrlView'));
  assert.match(src, /cacheMode=\{CMS_HTML_CACHE_MODE\}/);
  assert.equal(urlView.includes('cacheMode='), false);
  assert.equal(urlView.includes('cacheMode={'), false);
});

test('iOS initial load of baseUrl is allowed; other https goes to /web; CMS host is blocked', () => {
  const base = 'https://domenicospizza.com.au/';
  assert.equal(htmlViewNavDecision('about:blank', base), 'allow');
  assert.equal(htmlViewNavDecision('https://domenicospizza.com.au/', base), 'allow');
  assert.equal(htmlViewNavDecision('https://domenicospizza.com.au', base), 'allow');
  assert.equal(htmlViewNavDecision('https://domenicospizza.com.au/menu', base), 'web');
  assert.equal(htmlViewNavDecision('https://www.youtube.com/embed/abc', base), 'web');
  assert.equal(htmlViewNavDecision('https://mobileforge-studio.lovable.app/api', base), 'block');
  assert.equal(htmlViewNavDecision('tel:0733431144', base), 'link');
  assert.equal(isHtmlViewDocumentUrl('https://localhost/', 'https://localhost/'), true);
  assert.equal(htmlViewNavDecision('https://localhost/', 'https://localhost/'), 'allow');
});

test('Android hardware back is consumed only when the WebView can go back and is active', () => {
  assert.equal(shouldConsumeAndroidBack(true, true), true);
  assert.equal(shouldConsumeAndroidBack(false, true), false);
  assert.equal(shouldConsumeAndroidBack(true, false), false);
});
