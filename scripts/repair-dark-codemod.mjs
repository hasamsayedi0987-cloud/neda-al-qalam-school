#!/usr/bin/env node
/**
 * repair-dark-codemod.mjs — ترمیم خطای پیشوندی codemod:
 *  bg-X-500     → خراب به bg-X-50 dark:bg-X-500/100      → بازگردانی bg-X-500
 *  bg-X-500/NN  → خراب به bg-X-50 dark:bg-X-500/100/NN   → بازگردانی bg-X-500/NN
 *  hover:bg-X-500/NN → hover:bg-X-50 dark:bg-X-500/100/NN → hover:bg-X-500/NN
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RE = /((?:hover|focus|active|group-hover):)?bg-([a-z]+)-50 (?:dark:)?(?:hover:)?bg-\2-500\/100(?:\/(\d+))?/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const files = [...walk('src/components'), ...walk('src/app'), ...walk('src/lib')];
let n = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const next = src.replace(RE, (_m, prefix, hue, digits) =>
    digits ? `${prefix}bg-${hue}-500/${digits}` : `${prefix}bg-${hue}-500`,
  );
  if (next !== src) {
    writeFileSync(f, next);
    n++;
    console.log('repaired:', f);
  }
}
console.log('files repaired:', n);
