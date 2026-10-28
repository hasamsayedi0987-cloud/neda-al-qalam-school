#!/usr/bin/env node
/**
 * codemod-dark-mode.mjs — افزودن varian تاریک به کلاس‌های رنگی روشن‌محور
 *
 * قانون: هر خط که توکن هدف دارد و هیچ «dark:» در آن نیست → توکن + dark: توکن
 * خطوطی که خودشان dark: دارند دست نمی‌خورند (خودشان مسئول خودشان‌اند)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TEXT = {
  'text-emerald-600': 'dark:text-emerald-400', 'text-emerald-700': 'dark:text-emerald-300',
  'text-emerald-800': 'dark:text-emerald-300', 'text-emerald-900': 'dark:text-emerald-200',
  'text-sky-600': 'dark:text-sky-400', 'text-sky-700': 'dark:text-sky-300',
  'text-sky-800': 'dark:text-sky-300', 'text-sky-900': 'dark:text-sky-200',
  'text-rose-500': 'dark:text-rose-400', 'text-rose-600': 'dark:text-rose-400',
  'text-rose-700': 'dark:text-rose-300', 'text-rose-800': 'dark:text-rose-300', 'text-rose-900': 'dark:text-rose-200',
  'text-amber-500': 'dark:text-amber-400', 'text-amber-600': 'dark:text-amber-400',
  'text-amber-700': 'dark:text-amber-300', 'text-amber-800': 'dark:text-amber-300', 'text-amber-900': 'dark:text-amber-200',
  'text-violet-600': 'dark:text-violet-400', 'text-violet-700': 'dark:text-violet-300', 'text-violet-800': 'dark:text-violet-300',
  'text-teal-600': 'dark:text-teal-400', 'text-teal-700': 'dark:text-teal-300', 'text-teal-800': 'dark:text-teal-300',
  'text-indigo-600': 'dark:text-indigo-400', 'text-indigo-700': 'dark:text-indigo-300',
  'text-orange-600': 'dark:text-orange-400', 'text-orange-700': 'dark:text-orange-300',
  'text-cyan-600': 'dark:text-cyan-400', 'text-cyan-700': 'dark:text-cyan-300',
  'text-pink-600': 'dark:text-pink-400', 'text-pink-700': 'dark:text-pink-300',
  'text-fuchsia-600': 'dark:text-fuchsia-400', 'text-fuchsia-700': 'dark:text-fuchsia-300',
  'text-lime-600': 'dark:text-lime-400', 'text-lime-700': 'dark:text-lime-300',
  'text-red-500': 'dark:text-red-400', 'text-red-600': 'dark:text-red-400', 'text-red-700': 'dark:text-red-300',
  'text-green-500': 'dark:text-green-400', 'text-green-600': 'dark:text-green-400', 'text-green-700': 'dark:text-green-300',
  'text-blue-500': 'dark:text-blue-400', 'text-blue-600': 'dark:text-blue-400', 'text-blue-700': 'dark:text-blue-300',
  'text-yellow-600': 'dark:text-yellow-400', 'text-yellow-700': 'dark:text-yellow-300', 'text-yellow-800': 'dark:text-yellow-300',
  'text-slate-500': 'dark:text-slate-400', 'text-slate-600': 'dark:text-slate-400',
  'text-slate-700': 'dark:text-slate-300', 'text-slate-800': 'dark:text-slate-200', 'text-slate-900': 'dark:text-slate-100',
  'text-gray-500': 'dark:text-gray-400', 'text-gray-600': 'dark:text-gray-400',
  'text-gray-700': 'dark:text-gray-300', 'text-gray-800': 'dark:text-gray-200', 'text-gray-900': 'dark:text-gray-100',
};

const SHADES_BG = ['50', '100', '200'];
const SHADES_BORDER = ['100', '200', '300'];
const HUES = ['emerald', 'sky', 'rose', 'amber', 'violet', 'teal', 'indigo', 'orange', 'cyan', 'pink',
  'fuchsia', 'lime', 'red', 'green', 'blue', 'yellow', 'slate', 'gray', 'stone', 'zinc'];

const BG = {};
for (const h of HUES) for (const s of SHADES_BG) {
  BG[`bg-${h}-${s}`] = `dark:bg-${h}-500/${{ '50': '10', '100': '15', '200': '20' }[s]}`;
}
const BORDER = {};
for (const h of HUES) for (const s of SHADES_BORDER) {
  BORDER[`border-${h}-${s}`] = `dark:border-${h}-500/${{ '100': '25', '200': '30', '300': '40' }[s]}`;
}

const MAP = { ...TEXT, ...BG, ...BORDER };
const TOKEN_RE = new RegExp(
  Object.keys(MAP)
    .map((k) => k.replace(/[-]/g, '\\-'))
    .sort((a, b) => b.length - a.length)
    .join('|'),
  'g',
);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|ts)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const files = [...walk('src/components'), ...walk('src/app'), ...walk('src/lib')];
let touched = 0;
let replaced = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('dark:')) continue; // خط خودش مسئول وضوح تاریک خودش است
    if (!TOKEN_RE.test(line)) { TOKEN_RE.lastIndex = 0; continue; }
    TOKEN_RE.lastIndex = 0;
    const next = line.replace(TOKEN_RE, (m) => `${m} ${MAP[m]}`);
    if (next !== line) { lines[i] = next; changed = true; replaced++; }
  }
  if (changed) {
    writeFileSync(f, lines.join('\n'));
    touched++;
    console.log('patched:', f);
  }
}
console.log(`done — files: ${touched}, lines: ${replaced}`);
