#!/usr/bin/env npx tsx
/**
 * Pre-build check: load an app config and report pass/fail for homepage
 * Order Online / Our Venues destinations and every bottom-nav item.
 *
 *   npm run check:nav-links -- <config.json> [config.json...]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkNavLinks, formatNavLinkReport } from '../src/navLinkCheck';

const files = process.argv.slice(2).filter((a) => a && !a.startsWith('-'));
if (!files.length) {
  console.error('usage: npm run check:nav-links -- <config.json> [config.json...]');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const path = resolve(file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`FAIL  ${file}  (cannot read JSON: ${(err as Error).message})`);
    failed = true;
    continue;
  }
  const report = checkNavLinks(parsed);
  console.log(`# ${file}`);
  console.log(formatNavLinkReport(report));
  console.log('');
  if (!report.ok) failed = true;
}

process.exit(failed ? 1 : 0);
