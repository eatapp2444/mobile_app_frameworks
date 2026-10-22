import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectPageImageUrls, resolveHtmlBaseUrl } from './htmlAssets';
import { isOverlayPath, panesFromConfig } from './tabPanes';

const CONFIG_URL =
  'https://mobileforge-studio.lovable.app/api/public/apps/config/com.domenicospizzapastaribs.clientapp';

test('live Domenico config: keep-alive panes, wordpress baseUrl, page image prefetch list', async (t) => {
  let payload: any;
  try {
    const res = await fetch(CONFIG_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      t.skip(`config HTTP ${res.status}`);
      return;
    }
    payload = await res.json();
  } catch (err) {
    t.skip(`config unreachable: ${(err as Error).message}`);
    return;
  }

  const config = payload?.data?.config ?? payload?.data ?? payload?.config ?? payload;
  assert.equal(config?.app?.bundleId, 'com.domenicospizzapastaribs.clientapp');

  const panes = panesFromConfig(config);
  assert.ok(panes.some((p) => p.key === 'home'));
  assert.ok(panes.some((p) => p.key === 'page:about-us'));
  assert.ok(panes.some((p) => p.kind === 'web' && /orderexperience\.net/.test(p.url)));
  assert.ok(panes.some((p) => p.kind === 'web' && /orders\.eatapp\.online/.test(p.url)));

  const keys = panes.map((p) => p.key);
  assert.equal(isOverlayPath('/notifications', undefined, keys), true);
  assert.equal(isOverlayPath('/', undefined, keys), false);

  const homeHtml = String(config.home?.html ?? '');
  assert.equal(resolveHtmlBaseUrl(homeHtml, config.webview?.url), 'https://domenicospizza.com.au/');
  const images = collectPageImageUrls(config);
  assert.ok(images.some((u) => u.includes('wp-content/uploads')));
  assert.ok(images.every((u) => u.startsWith('https://')));
});
