import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppConfig } from './config';
import {
  collectPageImageUrls,
  isPrefetchableImage,
  resolveHtmlBaseUrl,
  urlsFromHtml,
} from './htmlAssets';

test('resolveHtmlBaseUrl skips font CDNs and uses the first real https origin', () => {
  const html = `
    @import url('https://fonts.googleapis.com/css2?family=Cabin');
    <img src="https://domenicospizza.com.au/wp-content/uploads/2024/10/Logo.png" />
  `;
  assert.equal(resolveHtmlBaseUrl(html), 'https://domenicospizza.com.au/');
});

test('resolveHtmlBaseUrl falls back to webview origin then the CMS host', () => {
  assert.equal(
    resolveHtmlBaseUrl('<p>no urls</p>', 'https://domenicospizza.com.au/menu'),
    'https://domenicospizza.com.au/',
  );
  assert.equal(resolveHtmlBaseUrl(''), 'https://mobileforge-studio.lovable.app/');
});

test('empty baseUrl is never returned', () => {
  assert.match(resolveHtmlBaseUrl('', ''), /^https:\/\//);
  assert.notEqual(resolveHtmlBaseUrl('<div></div>'), '');
});

test('urlsFromHtml collects wordpress images and ignores data/font urls', () => {
  const html = `
    <img src="data:image/webp;base64,AAAA" />
    <img src="https://domenicospizza.com.au/wp-content/uploads/2024/10/img-1800-pizza-002.jpg" />
    <img src="https://cdn.example/hero.png" />
    <style>@import url('https://fonts.googleapis.com/css2?family=Cabin');</style>
  `;
  assert.deepEqual(urlsFromHtml(html), [
    'https://domenicospizza.com.au/wp-content/uploads/2024/10/img-1800-pizza-002.jpg',
    'https://cdn.example/hero.png',
  ]);
});

test('isPrefetchableImage accepts wp-content even without a file extension', () => {
  assert.equal(
    isPrefetchableImage('https://domenicospizza.com.au/wp-content/uploads/2024/10/Logo.png'),
    true,
  );
  assert.equal(isPrefetchableImage('https://fonts.googleapis.com/css2?family=Cabin'), false);
  assert.equal(isPrefetchableImage('data:image/png;base64,xx'), false);
});

test('collectPageImageUrls reads home + page HTML from config', () => {
  const config = {
    app: { name: "Domenico's", bundleId: 'com.domenicospizzapastaribs.clientapp' },
    theme: {},
    home: {
      html: '<img src="https://domenicospizza.com.au/wp-content/uploads/2024/10/img-1800-pizza-002.jpg" />',
    },
    pages: [
      {
        slug: 'about-us',
        title: 'About Us',
        type: 'html',
        html: '<img src="https://domenicospizza.com.au/wp-content/uploads/2024/10/img-pizza-hero-001-1024x829.jpg" />',
      },
    ],
  } as AppConfig;

  const urls = collectPageImageUrls(config);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => u.startsWith('https://domenicospizza.com.au/wp-content/')));
});
