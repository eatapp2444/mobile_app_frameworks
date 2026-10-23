import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveHtmlBaseUrl } from './htmlViewPolicy';
import { isOverlayPath, panesFromConfig, shouldMountPane } from './tabPanes';

const CONFIG_URL =
  'https://mobileforge-studio.lovable.app/api/public/apps/config/com.domenicospizzapastaribs.clientapp';

test('live Domenico config: eager nav panes, site baseUrl, unknown slug overlay', async (t) => {
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
  assert.ok(panes.some((p) => p.key === 'home' && p.eager));
  assert.ok(panes.some((p) => p.key === 'page:about-us' && p.eager));
  const order = panes.find((p) => p.kind === 'web' && /orderexperience\.net/.test(p.url));
  assert.ok(order);
  assert.equal(shouldMountPane(order!, 'home', []), false);

  const keys = panes.map((p) => p.key);
  assert.equal(isOverlayPath('/notifications', undefined, keys), true);
  assert.equal(isOverlayPath('/', undefined, keys), false);
  assert.equal(isOverlayPath('/p/missing-page', undefined, keys), true);

  assert.equal(
    resolveHtmlBaseUrl({ webviewUrl: config.webview?.url, domain: config.app?.domain }),
    'https://domenicospizza.com.au/',
  );
});
