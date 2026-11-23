#!/usr/bin/env python3
# مقایسهٔ XML تک‌تک شیت‌ها: قالب اصلی در برابر فایل تولیدی سیستم
import zipfile, re, sys

TPL = 'public/templates/moe-annual-results-template.xlsx'
GEN = sys.argv[1] if len(sys.argv) > 1 else '/tmp/moe-filled.xlsx'

def sheets(z):
    d = {}
    zf = zipfile.ZipFile(z)
    wbxml = zf.read('xl/workbook.xml').decode('utf-8')
    rels = zf.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    rel = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
    for m in re.finditer(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wbxml):
        t = rel[m.group(2)].lstrip('/').replace('xl/', '')
        d[m.group(1).strip()] = 'xl/' + t
    return zf, d

zf1, s1 = sheets(TPL)
zf2, s2 = sheets(GEN)
print('شیت‌های قالب:', list(s1.keys()))
print('شیت‌های تولیدی:', list(s2.keys()))
print()
for name, path in s1.items():
    a = zf1.read(path).decode('utf-8')
    b = zf2.read(s2[name]).decode('utf-8') if name in s2 else '(ناموجود)'
    def feat(x, tag):
        m = re.search(f'<{tag}[^>]*/?>', x)
        return m.group(0) if m else '—'
    def count(x, tag):
        return len(re.findall(f'<{tag}[ />]', x))
    rows = [
        ('pageSetup', feat(a, 'pageSetup'), feat(b, 'pageSetup')),
        ('pageMargins', feat(a, 'pageMargins'), feat(b, 'pageMargins')),
        ('printOptions', feat(a, 'printOptions'), feat(b, 'printOptions')),
        ('sheetPr', feat(a, 'sheetPr'), feat(b, 'sheetPr')),
        ('dimension', feat(a, 'dimension'), feat(b, 'dimension')),
        ('cols تعریف', count(a, 'col '), count(b, 'col ')),
        ('mergeCells', count(a, 'mergeCell '), count(b, 'mergeCell ')),
        ('condFormat', count(a, 'conditionalFormatting'), count(b, 'conditionalFormatting')),
        ('dataValidation', count(a, 'dataValidation '), count(b, 'dataValidation ')),
        ('rowها', count(a, '<row '), count(b, '<row ')),
        ('حجره‌ها', count(a, '<c '), count(b, '<c ')),
    ]
    same = all(x[1] == x[2] for x in rows)
    print(f'{"═" if not same else "─"} [{name}]')
    for label, va, vb in rows:
        if va != vb:
            print(f'   {label}:\n     قالب: {va[:150]}\n     تولیدی: {vb[:150]}')
