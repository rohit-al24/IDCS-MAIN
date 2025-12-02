import logging

# Setup logging to file and console
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler("template_backend.log", mode="a", encoding="utf-8"),
        logging.StreamHandler()
    ]
)
from logging.handlers import RotatingFileHandler
logger = logging.getLogger("template_backend")
logger.setLevel(logging.INFO)

# Add file handler to log to 'server.log' with rotation
file_handler = RotatingFileHandler("server.log", maxBytes=2*1024*1024, backupCount=3)
file_handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s %(levelname)s %(name)s %(message)s')
file_handler.setFormatter(formatter)
if not any(isinstance(h, RotatingFileHandler) for h in logger.handlers):
    logger.addHandler(file_handler)
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from typing import List, Optional
import uvicorn
import os
import tempfile
import csv
from docx import Document
from server.routes.upload_questions_excel import router as upload_questions_router

app = FastAPI()

# Register the upload questions router
app.include_router(upload_questions_router, prefix="/api")

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
    regulation: str = Form("Regulation 2023"),
    semester: str = Form("Second Semester"),
    excel_meta: str = Form(None),
    ocr_images: Optional[str] = Form(None),
    title_image_url: Optional[str] = Form(None),
):
    from docx import Document
    from docx.shared import Pt, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
    import tempfile
    import os
    from io import BytesIO
    import base64, requests

    # Place a full-width image banner at the top if provided
    logo_url = title_image_url if title_image_url else None
    if logo_url and isinstance(logo_url, str) and logo_url.strip():
        try:
            banner_tbl = doc.add_table(rows=1, cols=1)
            banner_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
            banner_tbl.autofit = True
            banner_cell = banner_tbl.rows[0].cells[0]
            if logo_url.startswith('data:image/'):
                header, b64data = logo_url.split(',', 1)
                img_bytes = base64.b64decode(b64data)
                stream = BytesIO(img_bytes)
                banner_cell.paragraphs[0].add_run().add_picture(stream, width=Inches(6.5))
            elif logo_url.startswith('http://') or logo_url.startswith('https://'):
                resp = requests.get(logo_url, timeout=5)
                if resp.ok:
                    stream = BytesIO(resp.content)
                    banner_cell.paragraphs[0].add_run().add_picture(stream, width=Inches(6.5))
            banner_cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        except Exception:
            logger.exception("Failed to insert banner image; continuing without it")
    from docx.shared import Pt, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
    import tempfile
    import os


    # If excel_meta is provided, parse and override cc/cn/dept/semester
    import json
    meta = {}
    if excel_meta:
        try:
            meta = json.loads(excel_meta)
        except Exception:
            meta = {}
    # Excel meta expected keys: course_code_name, department, semester (number or string)
    cc_from_excel = meta.get('course_code_name') or cc
    dept_from_excel = meta.get('department') or dept
    sem_from_excel = meta.get('semester') or semester
    # Convert semester number to words if needed
    def semester_to_words(sem):
        try:
            n = int(str(sem).strip())
            words = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"]
            if 1 <= n <= 8:
                return f"{words[n-1]} Semester"
        except Exception:
            pass
        return str(sem)
    sem_word = semester_to_words(sem_from_excel)

    doc = Document()

    # Place a full-width image banner at the top if provided
    logo_url = title_image_url if title_image_url else None
    if logo_url and isinstance(logo_url, str) and logo_url.strip():
        try:
            banner_tbl = doc.add_table(rows=1, cols=1)
            banner_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
            banner_tbl.autofit = True
            banner_cell = banner_tbl.rows[0].cells[0]
            if logo_url.startswith('data:image/'):
                header, b64data = logo_url.split(',', 1)
                img_bytes = base64.b64decode(b64data)
                stream = BytesIO(img_bytes)
                banner_cell.paragraphs[0].add_run().add_picture(stream, width=Inches(6.5))
            elif logo_url.startswith('http://') or logo_url.startswith('https://'):
                resp = requests.get(logo_url, timeout=5)
                if resp.ok:
                    stream = BytesIO(resp.content)
                    banner_cell.paragraphs[0].add_run().add_picture(stream, width=Inches(6.5))
            banner_cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        except Exception:
            logger.exception("Failed to insert banner image; continuing without it")

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



    # Title and banner side by side at the top
    title_text = (exam_title).strip()
    logo_url = title_image_url if title_image_url else None
    tbl = doc.add_table(rows=1, cols=2)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = True
    # Title cell (left, centered)
    c_title = tbl.rows[0].cells[0]
    p_title = c_title.paragraphs[0]
    run_title = p_title.add_run(title_text)
    run_title.bold = True
    run_title.font.size = Pt(20)
    run_title.font.name = "Times New Roman"
    run_title.underline = True
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    # Banner cell (right, right-aligned)
    c_banner = tbl.rows[0].cells[1]
    if logo_url and isinstance(logo_url, str) and logo_url.strip():
        try:
            if logo_url.startswith('data:image/'):
                header, b64data = logo_url.split(',', 1)
                img_bytes = base64.b64decode(b64data)
                stream = BytesIO(img_bytes)
                c_banner.paragraphs[0].add_run().add_picture(stream, width=Inches(1.5))
            elif logo_url.startswith('http://') or logo_url.startswith('https://'):
                resp = requests.get(logo_url, timeout=5)
                if resp.ok:
                    stream = BytesIO(resp.content)
                    c_banner.paragraphs[0].add_run().add_picture(stream, width=Inches(1.5))
            c_banner.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        except Exception:
            logger.exception("Failed to insert banner image; continuing without it")
    else:
        c_banner.text = ""
    add_line(sem_word, True, 11, italic=True)
    add_line(dept_from_excel, True, 11, italic=True)
    add_bold_line(cc_from_excel, True, 12)
    add_line(f"({regulation})", True, 11)

    # Time and Maximum Marks on same line, left-aligned, with spacing
    p_tm = doc.add_paragraph()
    r_tm = p_tm.add_run("Time: Three Hours")
    r_tm.font.size = Pt(11)
    # Add enough spaces to separate
    r_tm2 = p_tm.add_run("")
    r_tm2.font.size = Pt(11)
    # Use tab for better alignment
    p_tm.add_run("\t").font.size = Pt(11)
    r_tm3 = p_tm.add_run("Maximum Marks: 100 Marks")
    r_tm3.font.size = Pt(11)
    p_tm.alignment = WD_ALIGN_PARAGRAPH.LEFT

   
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
    widths_a = [Inches(0.5), Inches(4.8), Inches(0.5), Inches(0.6), Inches(0.6)]
    widths_b = [Inches(0.5), Inches(4.8), Inches(0.5), Inches(0.6), Inches(0.6)]
    for i, w in enumerate(widths_b):
        for row in table_a.rows:
            row.cells[i].width = w
    for c in hdr_cells:
        for p in c.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
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
    # Parse optional OCR images map: { index_or_id: dataUrl }
    import json as _json
    ocr_map = {}
    try:
        if ocr_images:
            ocr_map = _json.loads(ocr_images)
            if not isinstance(ocr_map, dict):
                ocr_map = {}
    except Exception:
        logger.exception("Failed to parse ocr_images payload")
    logger.info("generate_docx called: received %d question(s)", len(_questions))
    # Normalize common image keys and log per-question image presence (without dumping full base64)
    try:
        image_count = 0
        for i, q in enumerate(_questions):
            if not isinstance(q, dict):
                logger.debug("Question %s is not a dict (type=%s)", i, type(q))
                continue
            # Support alternate keys the frontend might send
            for alt in ('image', 'img', 'imageUrl', 'img_url'):
                if alt in q and 'image_url' not in q:
                    q['image_url'] = q.get(alt)
                    logger.debug("Normalized image key '%s' -> 'image_url' for question %s", alt, i)

            img = q.get('image_url')
            if img:
                image_count += 1
                try:
                    kind = 'data' if isinstance(img, str) and img.startswith('data:') else ('http' if isinstance(img, str) and img.startswith('http') else type(img))
                    preview = (img[:80] + '...') if isinstance(img, str) and len(img) > 80 else str(img)
                    logger.info("Question %s: has image_url (kind=%s, preview=%s)", i, kind, preview)
                except Exception:
                    logger.exception("Error while logging image preview for question %s", i)
            else:
                logger.debug("Question %s: no image_url", i)

        logger.info("Found %d questions with image_url", image_count)
    except Exception:
        logger.exception("Error while counting/normalizing image URLs")

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
    import re

    # Use the first 10 questions as received (frontend order)
    import base64, requests
    from io import BytesIO
    # OCR helper
    def _ocr_data_url(data_url: str) -> Optional[str]:
        try:
            import pytesseract
            from PIL import Image
            header, b64data = data_url.split(',', 1)
            img_bytes = base64.b64decode(b64data)
            with BytesIO(img_bytes) as bio:
                img = Image.open(bio)
                # Convert to RGB to avoid issues
                if img.mode not in ("RGB", "L"):
                    img = img.convert("RGB")
                text = pytesseract.image_to_string(img)
                cleaned = text.strip()
                return cleaned if cleaned else None
        except Exception:
            logger.exception("OCR failed for provided data URL")
            return None
    for i, q in enumerate(_questions[:10]):
        row_cells = table_a.add_row().cells
        for j, w in enumerate(widths_a):
            row_cells[j].width = w

        # Question number
        row_cells[0].text = str(idx)

        # Question text without any label prefix
        text = _first_non_empty(q, ['text', 'question_text', 'question', 'q', 'title', 'body', 'content'])
        if text:
            text = re.sub(r'^\s*[DO]\.[\s-]*', '', text, flags=re.IGNORECASE)

        # Add text to cell, then image if present
        p = row_cells[1].paragraphs[0]
        if text:
            p.add_run(text)
        img_url = q.get('image_url')
        if img_url:
            try:
                # If OCR is requested and we have a matching data URL, try OCR
                do_ocr = bool(q.get('image_ocr'))
                if do_ocr and isinstance(img_url, str) and img_url.startswith('data:image/'):
                    ocr_text = _ocr_data_url(img_url)
                    if ocr_text:
                        p.add_run("\n" + ocr_text)
                        logger.info("Inserted OCR text for question index %s", idx)
                        raise StopIteration  # Skip image insertion below
                if img_url.startswith('data:image/'):
                    # data URL
                    header, b64data = img_url.split(',', 1)
                    img_bytes = base64.b64decode(b64data)
                    ext = '.png' if 'png' in header else '.jpg'
                    img_stream = BytesIO(img_bytes)
                    p.add_run().add_picture(img_stream, width=Inches(2.5))
                    logger.info("Inserted data:image for question index %s (ext=%s)", idx, ext)
                elif img_url.startswith('http'):
                    resp = requests.get(img_url)
                    if resp.ok:
                        content_type = resp.headers.get('content-type','')
                        ext = '.png' if 'png' in content_type else '.jpg'
                        img_stream = BytesIO(resp.content)
                        p.add_run().add_picture(img_stream, width=Inches(2.5))
                        logger.info("Fetched and inserted remote image for question index %s (content-type=%s)", idx, content_type)
            except StopIteration:
                pass
            except Exception as e:
                logger.exception("Failed to insert image for question index %s, img_url=%s", idx, img_url)
                p.add_run(" [Image error]")

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
        # Remove 'BTL' prefix if present, only show number
        btl_str = str(btl_val)
        if btl_str.upper().startswith('BTL'):
            btl_str = btl_str[3:]
        row_cells[3].text = btl_str.strip()

        # Marks: always 2 for Part-A
        row_cells[4].text = "2"

        # center-align numeric/small columns
        for p in row_cells[0].paragraphs + row_cells[2].paragraphs + row_cells[3].paragraphs + row_cells[4].paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        idx += 1
    # PART-B
    add_bold_line("PART – B                          (5 x 16 = 80 Marks)", True, 12)
    table_b = doc.add_table(rows=1, cols=5)
    table_b.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_b.autofit = False
    table_b.left_indent = Inches(0.1)
    hdr_cells = table_b.rows[0].cells
    hdr_cells[0].text = "Q.No."
    hdr_cells[1].text = "Question"
    hdr_cells[2].text = "CO"
    hdr_cells[3].text = "BTL"
    hdr_cells[4].text = "Marks"
    for c in hdr_cells:
        for p in c.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            for r in p.runs:
                r.bold = True
    widths_b = [Inches(0.5), Inches(4.8), Inches(0.5), Inches(0.6), Inches(0.6)]
    for i, w in enumerate(widths_b):
        for row in table_b.rows:
            row.cells[i].width = w
    # Render Part B with (a), OR row, (b) for each pair
    b_pairs = []
    temp_pair = []
    for q in _questions:
        if isinstance(q, dict) and q.get('part', '').upper() == 'B':
            temp_pair.append(q)
            if len(temp_pair) == 2:
                b_pairs.append(temp_pair)
                temp_pair = []
    # Always print 5 pairs: 11, 12, 13, 14, 15, even if some pairs are missing (insert empty rows)
    for pair_idx in range(5):
        base_no = str(11 + pair_idx)
        pair = b_pairs[pair_idx] if pair_idx < len(b_pairs) else None
        if pair:
            try:
                pair_sorted = sorted(pair, key=lambda q: str(q.get('sub','')))
            except Exception:
                pair_sorted = pair
            qa, qb = pair_sorted
        else:
            qa, qb = None, None
        # (a) row
        row_a = table_b.add_row().cells
        for i, w in enumerate(widths_b):
            row_a[i].width = w
        row_a[0].text = f"{base_no} A"
        p_a = row_a[1].paragraphs[0]
        p_a.paragraph_format.left_indent = Inches(0.0)
        if qa:
            # Add question text
            p_a.add_run(_first_non_empty(qa, ['text','question_text','question','q','title','body','content']))
            # Add image if present
            img_url = qa.get('image_url')
            if img_url:
                try:
                    do_ocr = bool(qa.get('image_ocr'))
                    if do_ocr and isinstance(img_url, str) and img_url.startswith('data:image/'):
                        ocr_text = _ocr_data_url(img_url)
                        if ocr_text:
                            p_a.add_run("\n" + ocr_text)
                            logger.info("Inserted OCR text for PART-B (a) %s", base_no)
                            raise StopIteration
                    if img_url.startswith('data:image/'):
                        header, b64data = img_url.split(',', 1)
                        img_bytes = base64.b64decode(b64data)
                        ext = '.png' if 'png' in header else '.jpg'
                        img_stream = BytesIO(img_bytes)
                        p_a.add_run().add_picture(img_stream, width=Inches(2.5))
                        logger.info("Inserted data:image for PART-A question %s (ext=%s)", idx, ext)
                    elif img_url.startswith('http'):
                        resp = requests.get(img_url)
                        if resp.ok:
                            content_type = resp.headers.get('content-type','')
                            ext = '.png' if 'png' in content_type else '.jpg'
                            img_stream = BytesIO(resp.content)
                            p_a.add_run().add_picture(img_stream, width=Inches(2.5))
                            logger.info("Fetched and inserted PART-A remote image for %s (content-type=%s)", idx, content_type)
                except StopIteration:
                    pass
                except Exception as e:
                    logger.exception("Failed to insert PART-A image for %s, img_url=%s", idx, img_url)
                    p_a.add_run(" [Image error]")
            row_a[2].text = _first_non_empty(qa, ['co','course_outcomes','courseOutcome','course_outcome','co_code'])
            row_a[3].text = _first_non_empty(qa, ['btl','bloom','bloom_level','bt','bt_level'])
            row_a[4].text = _first_non_empty(qa, ['marks','mark','score','points'])
        else:
            row_a[2].text = row_a[3].text = row_a[4].text = ""
        for p in (
            row_a[0].paragraphs + row_a[2].paragraphs + row_a[3].paragraphs + row_a[4].paragraphs
        ):
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # OR row (spanning all columns, centered)
        or_row = table_b.add_row().cells
        or_row[0].merge(or_row[-1])
        p_or = or_row[0].paragraphs[0]
        p_or.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_or.add_run("(OR)").bold = True

        # (b) row
        row_b = table_b.add_row().cells
        for i, w in enumerate(widths_b):
            row_b[i].width = w
        row_b[0].text = f"{base_no} B"
        p_b = row_b[1].paragraphs[0]
        p_b.paragraph_format.left_indent = Inches(0.0)
        if qb:
            # Add question text
            p_b.add_run(_first_non_empty(qb, ['text','question_text','question','q','title','body','content']))
            # Add image if present
            img_url = qb.get('image_url')
            if img_url:
                try:
                    do_ocr = bool(qb.get('image_ocr'))
                    if do_ocr and isinstance(img_url, str) and img_url.startswith('data:image/'):
                        ocr_text = _ocr_data_url(img_url)
                        if ocr_text:
                            p_b.add_run("\n" + ocr_text)
                            logger.info("Inserted OCR text for PART-B (b) %s", base_no)
                            raise StopIteration
                    if img_url.startswith('data:image/'):
                        header, b64data = img_url.split(',', 1)
                        img_bytes = base64.b64decode(b64data)
                        ext = '.png' if 'png' in header else '.jpg'
                        img_stream = BytesIO(img_bytes)
                        p_b.add_run().add_picture(img_stream, width=Inches(2.5))
                        logger.info("Inserted data:image for PART-B question %s (ext=%s)", idx, ext)
                    elif img_url.startswith('http'):
                        resp = requests.get(img_url)
                        if resp.ok:
                            content_type = resp.headers.get('content-type','')
                            ext = '.png' if 'png' in content_type else '.jpg'
                            img_stream = BytesIO(resp.content)
                            p_b.add_run().add_picture(img_stream, width=Inches(2.5))
                            logger.info("Fetched and inserted PART-B remote image for %s (content-type=%s)", idx, content_type)
                except StopIteration:
                    pass
                except Exception as e:
                    logger.exception("Failed to insert PART-B image for %s, img_url=%s", idx, img_url)
                    p_b.add_run(" [Image error]")
            row_b[2].text = _first_non_empty(qb, ['co','course_outcomes','courseOutcome','course_outcome','co_code'])
            row_b[3].text = _first_non_empty(qb, ['btl','bloom','bloom_level','bt','bt_level'])
            row_b[4].text = _first_non_empty(qb, ['marks','mark','score','points'])
        else:
            row_b[2].text = row_b[3].text = row_b[4].text = ""
        for p in (
            row_b[0].paragraphs + row_b[2].paragraphs + row_b[3].paragraphs + row_b[4].paragraphs
        ):
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
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
