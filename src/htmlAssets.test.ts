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
  htmlViewSourceChanged,
  isHtmlViewDocumentUrl,
  isHtmlViewUserTap,
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

test('iOS initial load of baseUrl is allowed; later homepage taps go to /web; CMS host is blocked', () => {
  const base = 'https://domenicospizza.com.au/';
  assert.equal(htmlViewNavDecision('about:blank', base), 'allow');
  assert.equal(htmlViewNavDecision('https://domenicospizza.com.au/', base), 'allow');
  assert.equal(htmlViewNavDecision('https://domenicospizza.com.au', base), 'allow');
  assert.equal(htmlViewNavDecision(base, base, { documentLoaded: true }), 'web');
  assert.equal(htmlViewNavDecision(base, base, { navigationType: 'click' }), 'web');
  assert.equal(htmlViewNavDecision(base, base, { documentLoaded: true, isTopFrame: false }), 'allow');
  assert.equal(htmlViewNavDecision('https://domenicospizza.com.au/menu', base), 'web');
  assert.equal(htmlViewNavDecision('https://www.youtube.com/embed/abc', base), 'web');
  assert.equal(htmlViewNavDecision('https://mobileforge-studio.lovable.app/api', base), 'block');
  assert.equal(htmlViewNavDecision('tel:0733431144', base), 'link');
  assert.equal(htmlViewNavDecision('eatapp://open/order', base), 'block');
  assert.equal(htmlViewNavDecision('eatapp://open/order', base, { navigationType: 'click' }), 'app');
  assert.equal(htmlViewNavDecision('eatapp://open/tab/venues', base, { navigationType: 'click' }), 'app');
  assert.equal(htmlViewNavDecision('eatapp://open/tab/Venues', base, { navigationType: 'click' }), 'app');
  assert.equal(htmlViewNavDecision('eatapp://open/tab/order?x=1', base, { navigationType: 'click' }), 'app');
  assert.equal(htmlViewNavDecision('eatapp://open/order', base, { documentLoaded: true }), 'block');
  assert.equal(
    htmlViewNavDecision('eatapp://open/order', base, { documentLoaded: true, navigationType: 'other' }),
    'block',
  );
  assert.equal(htmlViewNavDecision('eatapp://open/venues', base, { navigationType: 'click' }), 'block');
  assert.equal(htmlViewNavDecision('eatapp://launch/nuke', base, { navigationType: 'click' }), 'block');
  assert.equal(htmlViewNavDecision('eatapp://open', base), 'block');
  assert.equal(htmlViewNavDecision('eatapp://open/tab/', base), 'block');
  assert.equal(isHtmlViewUserTap({}), false);
  assert.equal(isHtmlViewUserTap({ navigationType: 'click' }), true);
  assert.equal(isHtmlViewUserTap({ documentLoaded: true }), false);
  assert.equal(isHtmlViewUserTap({ documentLoaded: true, navigationType: 'other' }), false);
  assert.equal(isHtmlViewUserTap({ navigationType: 'click', isTopFrame: false }), false);
  assert.equal(isHtmlViewDocumentUrl('https://localhost/', 'https://localhost/'), true);
  assert.equal(htmlViewNavDecision('https://localhost/', 'https://localhost/'), 'allow');
  assert.equal(htmlViewNavDecision('https://localhost/', 'https://localhost/', { documentLoaded: true }), 'web');
});

test('theme or baseUrl source rebuilds reset documentLoaded so iOS reload is allow, not /web', () => {
  const base = 'https://domenicospizza.com.au/';
  const before = { html: '<p>home</p>', baseUrl: base };
  const afterTheme = { html: '<p>home</p><style>:root{--primary:#111}</style>', baseUrl: base };
  const afterBase = { html: afterTheme.html, baseUrl: 'https://localhost/' };
  assert.equal(htmlViewSourceChanged(null, before), false);
  assert.equal(htmlViewSourceChanged(before, before), false);
  assert.equal(htmlViewSourceChanged(before, afterTheme), true);
  assert.equal(htmlViewSourceChanged(afterTheme, afterBase), true);
  assert.equal(htmlViewNavDecision(base, base, { documentLoaded: true }), 'web');
  assert.equal(htmlViewNavDecision(base, base, { documentLoaded: false }), 'allow');
  assert.equal(htmlViewNavDecision(afterBase.baseUrl, afterBase.baseUrl, { documentLoaded: false }), 'allow');
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'HtmlView.tsx'), 'utf8');
  assert.match(src, /htmlViewSourceChanged\(sourceRef\.current, source\)/);
  assert.match(src, /documentLoaded\.current = false/);
  assert.doesNotMatch(src, /htmlRef\.current === html/);
});

test('HtmlView intercepts eatapp:// as app actions and never pushes /web for them', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'HtmlView.tsx'), 'utf8');
  const htmlView = src.slice(0, src.indexOf('export function UrlView'));
  assert.match(htmlView, /decision === 'app'/);
  assert.match(htmlView, /runAppLink\(req\.url\)/);
  assert.match(htmlView, /shouldAcceptAppLink/);
  assert.match(htmlView, /payload\?\.type === 'eatapp'/);
  assert.match(htmlView, /href.slice\(0, 7\).toLowerCase\(\) !== 'eatapp:'/);
  assert.match(htmlView, /if \(!e\.isTrusted\) return;/);
  const appBranch = htmlView.slice(htmlView.indexOf("decision === 'app'"), htmlView.indexOf("decision === 'link'"));
  assert.doesNotMatch(appBranch, /router\.push/);
  assert.doesNotMatch(appBranch, /Linking\.openURL/);
  const urlView = src.slice(src.indexOf('export function UrlView'));
  assert.doesNotMatch(urlView, /eatapp:/);
});

test('Android hardware back is consumed only when the WebView can go back and is active', () => {
  assert.equal(shouldConsumeAndroidBack(true, true), true);
  assert.equal(shouldConsumeAndroidBack(false, true), false);
  assert.equal(shouldConsumeAndroidBack(true, false), false);
});
