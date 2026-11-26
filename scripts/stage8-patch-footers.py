#!/usr/bin/env python3
# پس‌پردازش شماره صفحه (سازگاری WPS): کلید فرمت در instrText پانوشت‌ها + حذف pgNumType خالی جلد
import re, shutil, sys, zipfile

path = sys.argv[1]
tmp = path + '.tmp'
zin = zipfile.ZipFile(path, 'r')
zout = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    data = zin.read(item.filename)
    name = item.filename
    if name == 'word/document.xml':
        xml = data.decode('utf-8')
        xml = xml.replace('<w:pgNumType/>', '')
        data = xml.encode('utf-8')
    elif re.match(r'word/footer\d+\.xml', name):
        xml = data.decode('utf-8')
        if 'PAGE' in xml:
            fmt = 'ROMAN' if '808081' in xml else 'arabic'
            xml = re.sub(r'(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)',
                         r'\1 PAGE \\* ' + fmt + r' \\* MERGEFORMAT \2', xml)
            # پاک‌سازی نشانگر رنگی
            xml = xml.replace('w:val="808081"', 'w:val="808080"')
        data = xml.encode('utf-8')
    zout.writestr(item, data)
zin.close()
zout.close()
shutil.move(tmp, path)
print('FOOTER_PATCH_DONE')
