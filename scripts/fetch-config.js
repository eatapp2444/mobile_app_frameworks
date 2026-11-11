#!/usr/bin/env node
/**
 * EatApp — build-time config sync.
 *
 * Pulls the live CMS config for ONE app (identified by its bundle id) and writes:
 *   assets/config/app.json   → offline fallback bundled into the binary
 *   assets/generated/icon.png, splash.png, adaptive-icon.png (when remote images exist)
 *
 * Runs automatically before every build (see package.json "prebuild"/"eas-build-pre-install").
 *
 * Env:
 *   EATAPP_BUNDLE_ID   (required) e.g. app.eatapp.thecommercial
 *   EATAPP_API_URL     (optional) defaults to the hosted CMS endpoint
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const API_URL =
  process.env.EATAPP_API_URL ||
  'https://apps.eatapp.com.au/api/public/apps/config';
const BUNDLE_ID = process.env.EATAPP_BUNDLE_ID || '';
// Never hard-fail: a missing/unreachable CMS config must not break `expo config`,
// `expo install`, or Expo's GitHub build integration. The app falls back to the
// bundled defaults and re-fetches the live config at runtime.
const STRICT = process.env.EATAPP_STRICT_CONFIG === '1';
function fail(message) {
  if (STRICT) {
    // A strict (CMS-dispatched) build must never silently ship the generic
    // "EatApp" name and placeholder icon.
    throw new Error(message);
  }
  console.warn(message + ' — continuing with bundled defaults.');
}

function get(url, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('http://') ? http : https;
    lib
      .get(url, { headers: { Accept: '*/*', ...headers } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
          res.resume();
          return resolve(get(new URL(res.headers.location, url).toString(), headers, redirects + 1));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }),
        );
      })
      .on('error', reject);
  });
}

async function download(url, dest) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const res = await get(url);
    if (res.status !== 200 || res.body.length < 100) return null;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, res.body);
    return dest;
  } catch {
    return null;
  }
}

(async () => {
  if (!BUNDLE_ID) {
    fail('[eatapp] EATAPP_BUNDLE_ID is required for a dynamic build.');
    return;
  }

  const url = `${API_URL}?bundle=${encodeURIComponent(BUNDLE_ID)}&_t=${Date.now()}`;
  console.log(`[eatapp] Fetching config for ${BUNDLE_ID}`);

  let payload;
  try {
    const res = await get(url, {
      'X-App-Bundle': BUNDLE_ID,
      'X-App-Platform': 'native',
      Accept: 'application/json',
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.body.toString().slice(0, 200)}`);
    payload = JSON.parse(res.body.toString('utf8'));
  } catch (err) {
    fail(`[eatapp] Config fetch failed: ${err.message}`);
    return;
  }

  const config = payload?.data?.config ?? payload?.data ?? payload?.config ?? payload;
  if (!config?.app?.bundleId) {
    fail('[eatapp] Unexpected config payload.');
    return;
  }

  // Android normally ships under a different application id than iOS, so the
  // CMS payload may legitimately report the iOS bundle id for an Android build.
  const ids = [config.app.bundleId, config.app.androidPackage]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  if (!ids.includes(BUNDLE_ID.toLowerCase())) {
    fail(`[eatapp] CMS returned ${config.app.bundleId} instead of ${BUNDLE_ID}.`);
    return;
  }

  const outFile = path.join(ROOT, 'assets/config/app.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(config, null, 2));
  console.log(`[eatapp] Wrote ${path.relative(ROOT, outFile)} for "${config.app.name}"`);

  const gen = path.join(ROOT, 'assets/generated');
  fs.mkdirSync(gen, { recursive: true });
  const icon = config.app?.icon || config.app?.logo;
  const splashLogo = config.splash?.logo || icon;
  const splashBg = config.splash?.backgroundImage;

  const wrote = {
    icon: await download(icon, path.join(gen, 'icon.png')),
    splashLogo: await download(splashLogo, path.join(gen, 'splash.png')),
    splashBg: await download(splashBg, path.join(gen, 'splash-bg.png')),
  };
  fs.writeFileSync(
    path.join(gen, 'manifest.json'),
    JSON.stringify(
      {
        bundleId: config.app.bundleId,
        fetchedAt: new Date().toISOString(),
        icon: !!wrote.icon,
        splashLogo: !!wrote.splashLogo,
        splashBg: !!wrote.splashBg,
      },
      null,
      2,
    ),
  );
  if (STRICT && !wrote.icon) {
    throw new Error(
      '[eatapp] No app icon could be downloaded from the CMS for ' +
        BUNDLE_ID +
        ' — upload an icon in the CMS (App -> Icon) before building.',
    );
  }
  console.log('[eatapp] Assets:', Object.entries(wrote).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none');
})().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
