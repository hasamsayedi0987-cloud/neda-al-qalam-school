#!/usr/bin/env python3
# تحلیل عمیق فایل اصلی جدول نتایج سالانه وزارت معارف — خروجی JSON کامل
import json, sys, zipfile
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

SRC = "/home/z/my-project/upload/1جدول نتایج سالانه1405جدید صنف دوم.xlsx"
OUT = "/tmp/moe-table-analysis.json"

wb = load_workbook(SRC)  # formulas
wbv = load_workbook(SRC, data_only=True)  # cached values

dump = {"sheets": []}
props = {
    "sheetnames": wb.sheetnames,
    "creator": wb.properties.creator,
}
dump["properties"] = props

def color_to_hex(c):
    if c is None: return None
    if c.type == "rgb": return c.rgb
    if c.type == "theme": return f"theme:{c.theme}+tint{round(c.tint,3)}"
    if c.type == "indexed": return f"idx{c.indexed}"
    return str(c.type)

def font_dump(f):
    return {"name": f.name, "size": f.size, "bold": f.bold, "italic": f.italic,
            "color": color_to_hex(f.color), "vertAlign": f.vertAlign, "underline": f.underline}

def align_dump(a):
    return {"horizontal": a.horizontal, "vertical": a.vertical, "wrap": a.wrap_text,
            "shrink": a.shrink_to_fit, "readingOrder": a.readingOrder, "indent": a.indent}

def border_dump(b):
    def side(s):
        return None if s is None or s.style is None else {"style": s.style, "color": color_to_hex(s.color)}
    return {"top": side(b.top), "bottom": side(b.bottom), "left": side(b.left), "right": side(b.right),
            "diagonal": side(b.diagonal), "diagUp": b.diagonalUp, "diagDown": b.diagonalDown}

for ws in wb.worksheets:
    wsv = wbv[ws.title]
    sheet = {
        "title": ws.title,
        "dims": ws.dimensions,
        "max_row": ws.max_row, "max_col": ws.max_column,
        "sheetView": {"rightToLeft": ws.sheet_view.rightToLeft, "showGridLines": ws.sheet_view.showGridLines,
                      "zoomScale": ws.sheet_view.zoomScale},
        "merged": [str(m) for m in ws.merged_cells.ranges],
        "colWidths": {}, "rowHeights": {},
        "pageSetup": {"paperSize": ws.page_setup.paperSize, "orientation": ws.page_setup.orientation,
                      "fitToWidth": ws.page_setup.fitToWidth, "fitToHeight": ws.page_setup.fitToHeight,
                      "scale": ws.page_setup.scale, "blackAndWhite": ws.page_setup.blackAndWhite},
        "margins": {"top": ws.page_margins.top, "bottom": ws.page_margins.bottom,
                    "left": ws.page_margins.left, "right": ws.page_margins.right,
                    "header": ws.page_margins.header, "footer": ws.page_margins.footer},
        "printArea": ws.print_area, "printTitles": ws.print_title_rows,
        "headerFooter": {"oddHeader": str(ws.oddHeader), "oddFooter": str(ws.oddFooter)},
        "freeze": ws.freeze_panes,
        "cells": {},
    }
    # column widths + hidden
    for letter, dim in ws.column_dimensions.items():
        if dim.width is not None or dim.hidden:
            sheet["colWidths"][letter] = {"width": round(dim.width, 2) if dim.width else None,
                                          "hidden": dim.hidden, "customWidth": dim.customWidth}
    # row heights
    for idx, dim in ws.row_dimensions.items():
        if dim.height is not None or dim.hidden:
            sheet["rowHeights"][idx] = {"height": round(dim.height, 2) if dim.height else None,
                                        "hidden": dim.hidden, "customHeight": dim.customHeight}
    # cells with content or style
    for row in ws.iter_rows():
        for c in row:
            has_val = c.value is not None and str(c.value).strip() != ""
            cv = wsv.cell(row=c.row, column=c.column).value
            if has_val or cv is not None:
                rec = {}
                if has_val: rec["f"] = str(c.value)[:120]
                if cv is not None and str(cv) != str(c.value): rec["v"] = str(cv)[:120]
                rec["font"] = font_dump(c.font)
                rec["fill"] = {"type": c.fill.fill_type if c.fill else None,
                               "fg": color_to_hex(c.fill.fgColor) if c.fill else None}
                rec["align"] = align_dump(c.alignment)
                rec["border"] = border_dump(c.border)
                if c.number_format != "General": rec["numfmt"] = c.number_format
                sheet["cells"][c.coordinate] = rec
    dump["sheets"].append(sheet)

# data validations
for s, ws in zip(dump["sheets"], wb.worksheets):
    dvs = []
    for dv in ws.data_validations.dataValidation:
        dvs.append({"type": dv.type, "formula1": dv.formula1, "ranges": str(dv.sqref)})
    if dvs: s["dataValidations"] = dvs

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(dump, f, ensure_ascii=False, indent=1)

print("sheets:", wb.sheetnames)
for s in dump["sheets"]:
    print(f"  {s['title']}: dims={s['dims']} maxRow={s['max_row']} maxCol={s['max_col']} merged={len(s['merged'])} cells={len(s['cells'])}")
    print(f"    RTL={s['sheetView']['rightToLeft']} paper={s['pageSetup']['paperSize']} orient={s['pageSetup']['orientation']} fitW={s['pageSetup']['fitToWidth']} scale={s['pageSetup']['scale']} area={s['printArea']}")
    print(f"    freeze={s['freeze']} cols={len(s['colWidths'])} rows={len(s['rowHeights'])} dv={len(s.get('dataValidations',[]))}")
print("dump →", OUT, len(json.dumps(dump, ensure_ascii=False))//1024, "KB")
