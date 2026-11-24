#!/usr/bin/env bun
/* جاسازی مُهر و امضای اداره به‌صورت dataURL — برای استفادهٔ همه‌جا (چاپ، پیش‌نمایش، آفلاین) */
import { readFileSync, writeFileSync } from 'fs';

const b64 = readFileSync('public/sign-stamp.png').toString('base64');
const out = `/* مُهر و امضای ادارهٔ مکتب — asset جاسازی‌شده (dataURL) برای کارت هویت */
export const SIGN_STAMP_DATA_URL = 'data:image/png;base64,${b64}';
`;
writeFileSync('src/lib/client/sign-stamp-data.ts', out);
console.log('✓ sign-stamp-data.ts:', Math.round(out.length / 1024), 'KB');
