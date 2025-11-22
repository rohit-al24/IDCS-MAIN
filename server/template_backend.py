from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from typing import List, Optional
import uvicorn
import os
import tempfile
import csv
from docx import Document

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/template/upload")
async def upload_template(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    content_lines: List[str] = []
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        if ext == ".txt":
            with open(tmp_path, encoding="utf-8") as f:
                content_lines = [line.strip() for line in f if line.strip()]
        elif ext == ".csv":
            with open(tmp_path, encoding="utf-8") as f:
                reader = csv.reader(f)
                for row in reader:
                    content_lines.append(", ".join(row))
        elif ext == ".docx":
            doc = Document(tmp_path)
            for para in doc.paragraphs:
                text = para.text.strip()
                if text:
                    content_lines.append(text)
        else:
            return JSONResponse(status_code=400, content={"error": "Unsupported file type"})
    finally:
        os.remove(tmp_path)
    return {"lines": content_lines}

@app.post("/api/template/scan-docx")
async def scan_docx(file: UploadFile = File(...)):
    import re
    from docx import Document
    import tempfile
    import os
    questions = []
    with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        doc = Document(tmp_path)
        part = None
        for table in doc.tables:
            # PART-A: 10x2 table
            if len(table.columns) == 4:
                part = 'A'
                for row in table.rows[1:]:
                    qtext = row.cells[1].text.strip()
                    co = row.cells[2].text.strip()
                    btl = row.cells[3].text.strip()
                    number = len(questions) + 1
                    if qtext:
                        questions.append({
                            'number': number,
                            'text': qtext,
                            'co': co,
                            'btl': btl,
                            'marks': 2,
                            'part': part
                        })
            # PART-B: 5x16 table (with OR)
            elif len(table.columns) >= 7:
                part = 'B'
                rows = table.rows
                i = 0
                while i < len(rows):
                    row = rows[i]
                    if 'OR' in row.cells[0].text.upper():
                        i += 1
                        continue
                    if i+2 < len(rows) and 'OR' in rows[i+1].cells[0].text.upper():
                        # a/b pair
                        q_a = row.cells[1].text.strip()
                        co_a = row.cells[2].text.strip() if len(row.cells) > 2 else ''
                        btl_a = row.cells[4].text.strip() if len(row.cells) > 4 else ''
                        marks_a = row.cells[6].text.strip() if len(row.cells) > 6 else '16'
                        q_b = rows[i+2].cells[1].text.strip()
                        co_b = rows[i+2].cells[2].text.strip() if len(rows[i+2].cells) > 2 else ''
                        btl_b = rows[i+2].cells[4].text.strip() if len(rows[i+2].cells) > 4 else ''
                        marks_b = rows[i+2].cells[6].text.strip() if len(rows[i+2].cells) > 6 else '16'
                        number = 10 + (len(questions) // 2) + 1
                        if q_a:
                            questions.append({
                                'number': f'{number}a',
                                'text': q_a,
                                'co': co_a,
                                'btl': btl_a,
                                'marks': marks_a,
                                'part': part,
                                'or': False
                            })
                        if q_b:
                            questions.append({
                                'number': f'{number}b',
                                'text': q_b,
                                'co': co_b,
                                'btl': btl_b,
                                'marks': marks_b,
                                'part': part,
                                'or': True
                            })
                        i += 3
                    else:
                        i += 1
    finally:
        os.remove(tmp_path)
    return {"questions": questions}

@app.post("/api/template/generate-docx")
async def generate_docx(
    questions: list = Form(...),
    dept: str = Form(""),
    cc: str = Form(""),
    cn: str = Form(""),
    qpcode: str = Form(""),
    exam_title: str = Form("B.E., /B.Tech., DEGREE EXAMINATIONS, APRIL/MAY2024"),
    regulation: str = Form("Regulation 2024"),
    semester: str = Form("Second Semester"),
):
    from docx import Document
    from docx.shared import Pt, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
    import tempfile
    import os

    doc = Document()

    # Helpers
    def add_bold_line(text: str, align_center: bool = True, size: int = 12):
        p = doc.add_paragraph()
        run = p.add_run(text)
        run.bold = True
        run.font.size = Pt(size)
        if align_center:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        return p

    def add_line(text: str, align_center: bool = True, size: int = 12, italic: bool = False):
        p = doc.add_paragraph()
        run = p.add_run(text)
        run.italic = italic
        run.font.size = Pt(size)
        if align_center:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        return p

    # Spacer and a thin header row used as rule
    doc.add_paragraph(" ")
    rule = doc.add_table(rows=1, cols=16)
    rule.alignment = WD_TABLE_ALIGNMENT.CENTER
    for cell in rule.rows[0].cells:
        cell.text = " "

    # Header block
    p_reg = doc.add_paragraph()
    run_reg = p_reg.add_run("               Reg. No. :")
    run_reg.bold = True
    run_reg.font.size = Pt(12)
    p_reg.alignment = WD_ALIGN_PARAGRAPH.LEFT

    add_bold_line("K. RAMAKRISHNAN COLLEGE OF ENGINEERING", True, 14)
    add_bold_line("(AUTONOMOUS)", True, 12)
    add_bold_line(f"Question Paper Code: {qpcode}", True, 12)
    add_bold_line(exam_title, True, 12)
    add_line(semester, True, 11, italic=True)
    add_line(dept, True, 11, italic=True)
    add_bold_line(f"{cc} – {cn}", True, 12)
    add_line(f"({regulation})", True, 11)

    p_tm = doc.add_paragraph()
    r_tm = p_tm.add_run("Time: Three Hours          Maximum Marks: 100 Marks")
    r_tm.font.size = Pt(11)
    p_tm.alignment = WD_ALIGN_PARAGRAPH.LEFT

    doc.add_paragraph(" ")
    # PART-A
    add_bold_line("PART- A         (10 x 2 = 20 Marks)", True, 12)
    table_a = doc.add_table(rows=1, cols=5)
    table_a.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_a.autofit = False
    hdr_cells = table_a.rows[0].cells
    hdr_cells[0].text = "Q.No."
    hdr_cells[1].text = "Answer ALL\nQuestions"
    hdr_cells[2].text = "CO"
    hdr_cells[3].text = "BTL"
    hdr_cells[4].text = "Marks"
    # Column widths
    widths_a = [Inches(0.7), Inches(4.2), Inches(0.8), Inches(0.8), Inches(0.8)]
    for i, w in enumerate(widths_a):
        for row in table_a.rows:
            row.cells[i].width = w
    for c in hdr_cells:
        for p in c.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                r.bold = True

    # Normalize incoming questions to dicts
    import json, random
    def _normalize(raw):
        out = []
        def _push(item):
            if isinstance(item, str):
                try:
                    item = json.loads(item)
                except Exception:
                    item = {"text": item}
            if isinstance(item, list):
                for sub in item:
                    _push(sub)
            elif isinstance(item, dict):
                out.append(item)
        # entry point
        if isinstance(raw, str) or isinstance(raw, dict) or isinstance(raw, list):
            _push(raw)
        else:
            try:
                _push(json.loads(str(raw)))
            except Exception:
                pass
        return out

    _questions = _normalize(questions)

    # Choose up to 10 random Part-A questions; fall back sensibly
    a_questions = [q for q in _questions if str(q.get('part', '')).upper() == 'A']
    if not a_questions:
        # heuristic fallback by marks/type if part missing
        a_questions = [
            q for q in _questions
            if str(q.get('marks', '')).strip().lower() in ("2", "2m", "2 marks", "2 mark", "2-marks")
            or str(q.get('type', '')).strip().lower() in ("a", "part-a", "short", "objective", "two", "2")
        ]
    if not a_questions:
        a_questions = _questions

    random.shuffle(a_questions)
    selected_a = a_questions[:10]

    # Helpers to read common field names
    def _first_non_empty(d: dict, keys: list[str]):
        for k in keys:
            if k in d and d[k] is not None and str(d[k]).strip() != "":
                return str(d[k])
        return ""

    # Separate descriptive and objective questions for PART-A
    desc_qs = [q for q in _questions if isinstance(q, dict) and (
        str(q.get('type', '')).lower() in ('descriptive', 'd', 'desc', 'long', 'theory') or
        (str(q.get('part', '')).upper() == 'A' and str(q.get('marks', '2')).strip() != '2')
    )]
    obj_qs = [q for q in _questions if isinstance(q, dict) and (
        str(q.get('type', '')).lower() in ('objective', 'o', 'obj', 'short', 'mcq', 'one', '2', 'two') or
        (str(q.get('part', '')).upper() == 'A' and str(q.get('marks', '2')).strip() == '2')
    )]
    # Fallbacks if not enough
    if not desc_qs:
        desc_qs = [q for q in _questions if isinstance(q, dict)]
    if not obj_qs:
        obj_qs = [q for q in _questions if isinstance(q, dict)]
    random.shuffle(desc_qs)
    random.shuffle(obj_qs)

    # Prepare BTL shared value for questions 5-10 (must be 3,4 or 5)
    btl_shared = random.choice([3, 4, 5])
    idx = 1
    for i in range(10):
        # 4th (i=3) must be objective, 9th (i=8) must be descriptive, 5,7 also descriptive, 6,8,10 objective
        if i in [4, 6, 8]:  # 5th, 7th, 9th (1-based) should be descriptive, but 9th (i=8) is descriptive
            want_descriptive = True
        elif i in [3, 5, 7, 9]:  # 4th, 6th, 8th, 10th (1-based) should be objective
            want_descriptive = False
        else:
            want_descriptive = (i % 2 == 0)
        label = 'D.' if want_descriptive else 'O.'
        if want_descriptive:
            q = desc_qs.pop() if desc_qs else (obj_qs.pop() if obj_qs else {})
        else:
            q = obj_qs.pop() if obj_qs else (desc_qs.pop() if desc_qs else {})

        row_cells = table_a.add_row().cells
        for j, w in enumerate(widths_a):
            row_cells[j].width = w

        # Question number
        row_cells[0].text = str(idx)

        # Question text with type label
        text = _first_non_empty(q, ['text', 'question_text', 'question', 'q', 'title', 'body', 'content'])
        row_cells[1].text = f"{label} {text}" if text else label

        # CO: use from question if present, else fallback to mapping
        co_val = q.get('co') or q.get('CO') or q.get('course_outcome')
        if co_val:
            row_cells[2].text = str(co_val)
        else:
            co_num = (i // 2) + 1
            row_cells[2].text = f"CO{co_num}"

        # BTL logic: random for first 4 questions, shared value for 5-10
        if i < 4:
            btl_val = q.get('btl') or q.get('BTL') or random.choice([1, 2, 3, 4, 5])
        else:
            btl_val = q.get('btl') or q.get('BTL') or btl_shared
        row_cells[3].text = f"BTL{btl_val}"

        # Marks: always 2 for Part-A
        row_cells[4].text = "2"

        # center-align numeric/small columns
        for p in row_cells[0].paragraphs + row_cells[2].paragraphs + row_cells[3].paragraphs + row_cells[4].paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        idx += 1
    # PART-B
    add_bold_line("PART – B                          (5 x 16 = 80 Marks)", True, 12)
    table_b = doc.add_table(rows=1, cols=7)
    table_b.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_b.autofit = False
    hdr_cells = table_b.rows[0].cells
    hdr_cells[0].text = "Q.No."
    hdr_cells[1].text = "Question"
    hdr_cells[2].text = "CO"
    hdr_cells[3].text = "BTL"
    hdr_cells[4].text = "Marks"
    hdr_cells[5].text = "OR"
    hdr_cells[6].text = " "
    for c in hdr_cells:
        for p in c.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                r.bold = True

    # Column widths for Part-B
    widths_b = [Inches(0.7), Inches(4.2), Inches(0.8), Inches(0.8), Inches(1.0), Inches(0.8), Inches(0.8)]
    for i, w in enumerate(widths_b):
        for row in table_b.rows:
            row.cells[i].width = w
    for q in _questions:
        if isinstance(q, dict) and q.get('part', '').upper() == 'B':
            row_cells = table_b.add_row().cells
            for i, w in enumerate([Inches(0.7), Inches(4.2), Inches(0.8), Inches(0.8), Inches(1.0), Inches(0.8), Inches(0.8)]):
                row_cells[i].width = w
            row_cells[0].text = str(q.get('number', ''))
            row_cells[1].text = _first_non_empty(q, ['text','question_text','question','q','title','body','content'])
            row_cells[2].text = _first_non_empty(q, ['co','course_outcomes','courseOutcome','course_outcome','co_code'])
            row_cells[3].text = _first_non_empty(q, ['btl','bloom','bloom_level','bt','bt_level'])
            row_cells[4].text = _first_non_empty(q, ['marks','mark','score','points'])
            row_cells[5].text = "(OR)" if q.get('or', False) else ""
            row_cells[6].text = ""
            # Center numeric/small columns
            for p in (
                row_cells[0].paragraphs + row_cells[2].paragraphs + row_cells[3].paragraphs +
                row_cells[4].paragraphs + row_cells[5].paragraphs + row_cells[6].paragraphs
            ):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        else:
            # Optionally skip non-dict items
            continue
    doc.add_paragraph(" ")
    doc.add_paragraph("******************").bold = True
    # Footer
    doc.add_paragraph(f"  {qpcode}").bold = True
    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as tmp:
        doc.save(tmp.name)
        tmp_path = tmp.name
    return FileResponse(tmp_path, filename="question_paper.docx")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=4000)
