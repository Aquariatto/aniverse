#!/usr/bin/env python3
"""把 AniVerse-应用层接口说明.md 转成排版好的 docx。

    python scripts/build-docx.py

只处理本文档用到的 Markdown 子集：标题、段落、表格、代码块、引用、列表、粗体、行内代码。
"""
import os
import re
import sys

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '..', 'AniVerse-应用层接口说明.md')
OUT = os.path.join(ROOT, '..', 'AniVerse-应用层接口说明.docx')

BODY_FONT = '微软雅黑'
CODE_FONT = 'Consolas'
ACCENT = RGBColor(0x5B, 0x48, 0xA8)
MUTED = RGBColor(0x6B, 0x64, 0x75)
CODE_BG = 'F4F2F9'


def set_cjk(run, font=BODY_FONT):
    """中文字体要单独设 w:eastAsia，否则 Word 会回退到宋体。"""
    run.font.name = font
    rpr = run._element.get_or_add_rPr()
    fonts = rpr.find(qn('w:rFonts'))
    if fonts is None:
        fonts = OxmlElement('w:rFonts')
        rpr.append(fonts)
    for attr in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
        fonts.set(qn(attr), font)


def shade(paragraph_or_cell, fill):
    element = paragraph_or_cell._element
    pr = element.get_or_add_pPr() if hasattr(element, 'get_or_add_pPr') else element.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill)
    pr.append(shd)


def add_field(paragraph, code):
    run = paragraph.add_run()
    begin = OxmlElement('w:fldChar')
    begin.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = code
    end = OxmlElement('w:fldChar')
    end.set(qn('w:fldCharType'), 'end')
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(end)


def add_inline(paragraph, text, size=10.5, color=None, bold_default=False):
    """解析 **粗体** 和 `行内代码`。"""
    pattern = re.compile(r'(\*\*[^*]+\*\*|`[^`]+`)')
    for piece in pattern.split(text):
        if not piece:
            continue
        if piece.startswith('**') and piece.endswith('**'):
            run = paragraph.add_run(piece[2:-2])
            run.bold = True
            set_cjk(run)
            run.font.size = Pt(size)
        elif piece.startswith('`') and piece.endswith('`'):
            run = paragraph.add_run(piece[1:-1])
            set_cjk(run, CODE_FONT)
            run.font.size = Pt(size - 1)
            run.font.color.rgb = RGBColor(0x4A, 0x3F, 0x6B)
        else:
            run = paragraph.add_run(piece)
            run.bold = bold_default
            set_cjk(run)
            run.font.size = Pt(size)
        if color is not None:
            run.font.color.rgb = color


def split_row(line):
    cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
    return cells


def is_separator(line):
    return bool(re.match(r'^\s*\|?[\s:|-]+\|[\s:|-]*$', line)) and '-' in line


def add_table(document, rows):
    header, body = rows[0], rows[1:]
    table = document.add_table(rows=1, cols=len(header))
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # 按内容长度分配列宽（总宽 16.4cm = A4 去掉左右 2.3cm 边距）
    usable = 16.4
    weights = []
    for index in range(len(header)):
        longest = max([len(header[index])] + [len(r[index]) for r in body if len(r) > index])
        weights.append(max(6, min(longest, 46)))
    total = sum(weights)
    widths = [Cm(usable * w / total) for w in weights]

    # 固定布局：不然 Word 会按内容重新分配，列宽全被顶开
    tbl_pr = table._tbl.tblPr
    layout = OxmlElement('w:tblLayout')
    layout.set(qn('w:type'), 'fixed')
    tbl_pr.append(layout)
    tbl_w = tbl_pr.find(qn('w:tblW'))
    if tbl_w is None:
        tbl_w = OxmlElement('w:tblW')
        tbl_pr.append(tbl_w)
    tbl_w.set(qn('w:w'), str(int(usable / 2.54 * 1440)))
    tbl_w.set(qn('w:type'), 'dxa')
    for index, width in enumerate(widths):
        table.columns[index].width = width

    head_cells = table.rows[0].cells
    for index, text in enumerate(header):
        cell = head_cells[index]
        cell.text = ''
        paragraph = cell.paragraphs[0]
        paragraph.paragraph_format.space_before = Pt(2)
        paragraph.paragraph_format.space_after = Pt(2)
        run = paragraph.add_run(text.replace('**', ''))
        run.bold = True
        set_cjk(run)
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        shade(cell, '6B58B8')
        cell.width = widths[index]

    for row in body:
        cells = table.add_row().cells
        for index in range(len(header)):
            cell = cells[index]
            cell.text = ''
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_before = Pt(1)
            paragraph.paragraph_format.space_after = Pt(1)
            add_inline(paragraph, row[index] if index < len(row) else '', size=8.5)
            cell.width = widths[index]
    document.add_paragraph()
    return table


def build():
    if not os.path.isfile(SRC):
        sys.exit(f'找不到源文档：{SRC}')

    text = open(SRC, encoding='utf-8').read()
    lines = text.split('\n')

    document = Document()
    section = document.sections[0]
    section.page_height = Cm(29.7)
    section.page_width = Cm(21)
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(2.2)
    section.left_margin = Cm(2.3)
    section.right_margin = Cm(2.3)

    normal = document.styles['Normal']
    normal.font.size = Pt(10.5)
    normal.font.name = BODY_FONT
    normal.element.rPr.rFonts.set(qn('w:eastAsia'), BODY_FONT)
    normal.paragraph_format.line_spacing = 1.5
    normal.paragraph_format.space_after = Pt(4)

    # ---------- 封面 ----------
    title = document.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_before = Pt(150)
    run = title.add_run('AniVerse')
    run.bold = True
    set_cjk(run)
    run.font.size = Pt(34)
    run.font.color.rgb = ACCENT

    subtitle = document.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run('应用层接口设计说明')
    run.bold = True
    set_cjk(run)
    run.font.size = Pt(22)

    tagline = document.add_paragraph()
    tagline.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tagline.paragraph_format.space_before = Pt(6)
    run = tagline.add_run('长期记忆驱动的多模态角色陪伴与叙事交互系统')
    set_cjk(run)
    run.font.size = Pt(11)
    run.font.color.rgb = MUTED

    info = document.add_paragraph()
    info.alignment = WD_ALIGN_PARAGRAPH.CENTER
    info.paragraph_format.space_before = Pt(90)
    for label, value in (('课程作业', '应用层模块搭建与前端交互实现'), ('作者', '申锦豪'), ('运行方式', 'python start.py → http://127.0.0.1:8787')):
        run = info.add_run(f'{label}：')
        set_cjk(run)
        run.font.size = Pt(10)
        run.font.color.rgb = MUTED
        run = info.add_run(f'{value}\n')
        set_cjk(run)
        run.font.size = Pt(10)

    document.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    # ---------- 正文 ----------
    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if not stripped:
            index += 1
            continue

        # 代码块
        if stripped.startswith('```'):
            index += 1
            block = []
            while index < len(lines) and not lines[index].strip().startswith('```'):
                block.append(lines[index])
                index += 1
            index += 1
            for code_line in block:
                paragraph = document.add_paragraph()
                paragraph.paragraph_format.space_before = Pt(0)
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.paragraph_format.line_spacing = 1.15
                paragraph.paragraph_format.left_indent = Cm(0.2)
                shade(paragraph, CODE_BG)
                run = paragraph.add_run(code_line if code_line.strip() else ' ')
                set_cjk(run, CODE_FONT)
                run.font.size = Pt(8.5)
                run.font.color.rgb = RGBColor(0x33, 0x2C, 0x45)
            document.add_paragraph().paragraph_format.space_after = Pt(2)
            continue

        # 表格
        if stripped.startswith('|') and index + 1 < len(lines) and is_separator(lines[index + 1]):
            rows = [split_row(stripped)]
            index += 2
            while index < len(lines) and lines[index].strip().startswith('|'):
                rows.append(split_row(lines[index]))
                index += 1
            add_table(document, rows)
            continue

        # 分隔线
        if re.match(r'^-{3,}$', stripped):
            paragraph = document.add_paragraph()
            paragraph.paragraph_format.space_before = Pt(2)
            paragraph.paragraph_format.space_after = Pt(2)
            run = paragraph.add_run('·  ·  ·')
            run.font.color.rgb = RGBColor(0xC5, 0xBD, 0xD6)
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            index += 1
            continue

        # 标题
        heading = re.match(r'^(#{1,4})\s+(.*)$', stripped)
        if heading:
            level = len(heading.group(1))
            content = heading.group(2).strip()
            if level == 1:
                paragraph = document.add_paragraph()
                run = paragraph.add_run(content)
                run.bold = True
                set_cjk(run)
                run.font.size = Pt(18)
                run.font.color.rgb = ACCENT
                paragraph.paragraph_format.space_before = Pt(4)
                paragraph.paragraph_format.space_after = Pt(10)
            elif level == 2:
                paragraph = document.add_paragraph(style='Heading 1')
                run = paragraph.add_run(content)
                set_cjk(run)
                run.font.size = Pt(15)
                run.font.color.rgb = ACCENT
                paragraph.paragraph_format.space_before = Pt(16)
                paragraph.paragraph_format.space_after = Pt(8)
            else:
                paragraph = document.add_paragraph(style='Heading 2')
                run = paragraph.add_run(content)
                set_cjk(run)
                run.font.size = Pt(12)
                run.font.color.rgb = RGBColor(0x3A, 0x32, 0x4C)
                paragraph.paragraph_format.space_before = Pt(12)
                paragraph.paragraph_format.space_after = Pt(6)
            index += 1
            continue

        # 引用
        if stripped.startswith('>'):
            paragraph = document.add_paragraph()
            paragraph.paragraph_format.left_indent = Cm(0.5)
            add_inline(paragraph, stripped.lstrip('> ').strip(), size=9.5, color=MUTED)
            index += 1
            continue

        # 列表
        bullet = re.match(r'^[-*]\s+(.*)$', stripped)
        numbered = re.match(r'^(\d+)\.\s+(.*)$', stripped)
        if bullet or numbered:
            paragraph = document.add_paragraph()
            paragraph.paragraph_format.left_indent = Cm(0.7)
            paragraph.paragraph_format.first_line_indent = Cm(-0.35)
            paragraph.paragraph_format.space_after = Pt(2)
            prefix = '· ' if bullet else f'{numbered.group(1)}. '
            run = paragraph.add_run(prefix)
            set_cjk(run)
            run.font.size = Pt(10.5)
            run.font.color.rgb = ACCENT
            add_inline(paragraph, (bullet or numbered).group(1 if bullet else 2))
            index += 1
            continue

        # 普通段落
        paragraph = document.add_paragraph()
        add_inline(paragraph, stripped)
        index += 1

    # ---------- 页脚页码 ----------
    footer = document.sections[0].footer
    foot_paragraph = footer.paragraphs[0]
    foot_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = foot_paragraph.add_run('AniVerse · 应用层接口设计说明 · ')
    set_cjk(run)
    run.font.size = Pt(8)
    run.font.color.rgb = MUTED
    add_field(foot_paragraph, 'PAGE')
    run = foot_paragraph.add_run(' / ')
    run.font.size = Pt(8)
    add_field(foot_paragraph, 'NUMPAGES')
    for run in foot_paragraph.runs:
        set_cjk(run)
        run.font.size = Pt(8)
        run.font.color.rgb = MUTED

    document.save(OUT)
    print('已生成:', OUT)
    print('大小:', round(os.path.getsize(OUT) / 1024, 1), 'KB')


if __name__ == '__main__':
    build()
