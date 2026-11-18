// رفت‌وبرگشت exceljs: بارگذاری و ذخیرهٔ مجدد قالب
const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('public/templates/moe-annual-results-template.xlsx');
  await wb.xlsx.writeFile('/tmp/roundtrip.xlsx');
  console.log('roundtrip done');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
