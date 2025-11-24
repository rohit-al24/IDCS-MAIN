from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List
from openpyxl import load_workbook
from io import BytesIO
import re

router = APIRouter()

@router.post("/upload-questions-excel/")
def upload_questions_excel(file: UploadFile = File(...)):
    try:
        data = file.file.read()
        wb = load_workbook(BytesIO(data), data_only=True)
        ws = wb.active
        header_row_idx = None
        headers: List[str] = []
        # Always use the 3rd row as the header row (Excel row 3, 1-based)
        header_row_idx = 3
        required = ["Question Bank", "TYPE", "BTL Level", "Course Outcomes", "Marks", "Part"]
        headers = [str(ws.cell(row=header_row_idx, column=c).value).strip() if ws.cell(row=header_row_idx, column=c).value is not None else '' for c in range(1, ws.max_column + 1)]
        # Fuzzy header matching: normalize (lower, remove spaces/newlines), allow partial matches
        def norm(s):
            return re.sub(r"\s+", "", s or "").replace("\n","").replace("\r","").lower()
        norm_headers = [norm(h) for h in headers]
        header_map = {}
        for col in required:
            norm_col = norm(col)
            found = False
            for idx, h in enumerate(norm_headers):
                if norm_col in h or h in norm_col:
                    header_map[col] = idx+1
                    found = True
                    break
            if not found:
                raise HTTPException(status_code=400, detail=f"Missing required column: {col}. Found headers: {headers}")
        questions = []
        for r in range(header_row_idx + 1, ws.max_row + 1):
            qtext = str(ws.cell(row=r, column=header_map['Question Bank']).value or '').strip()
            if not qtext:
                continue
            type_raw = str(ws.cell(row=r, column=header_map['TYPE']).value or '').strip().lower()
            if type_raw == 'o':
                qtype = 'objective'
            elif type_raw == 'd':
                qtype = 'descriptive'
            else:
                continue
            btl_raw = ws.cell(row=r, column=header_map['BTL Level']).value
            btl = 2
            if btl_raw is not None:
                btl_str = str(btl_raw).strip().upper()
                # Extract all numbers from the string (e.g., 'BTL4', '4/5', '4,5', 'BTL 5', etc.)
                btl_nums = re.findall(r'\d+', btl_str)
                if btl_nums:
                    # Use the highest BTL number found
                    btl = int(max(btl_nums, key=int))
            marks_raw = ws.cell(row=r, column=header_map['Marks']).value
            try:
                marks = int(marks_raw) if marks_raw is not None else 1
            except Exception:
                marks = 1
            co_raw = str(ws.cell(row=r, column=header_map['Course Outcomes']).value or '').replace('\n',' ').replace('\r',' ').strip()
            co = None
            if co_raw:
                # Attempt numeric mapping
                try:
                    num = float(co_raw)
                    if int(num) in range(1,6):
                        co = f"CO{int(num)}"
                except Exception:
                    pass
                if co is None:
                    s = re.sub(r"\s+", " ", co_raw).upper()
                    digit_match = re.search(r"\b([1-5])\b", s)
                    if s.startswith('CO') and digit_match:
                        co = f"CO{digit_match.group(1)}"
                    elif digit_match:
                        co = f"CO{digit_match.group(1)}"
            chapter = str(ws.cell(row=r, column=header_map['Part']).value or '').strip() or None
            questions.append({
                'question_text': qtext,
                'type': qtype,
                'btl': btl,
                'marks': marks,
                'course_outcomes': co,
                'chapter': chapter
            })
        if not questions:
            return {'questions': [], 'warning': f'No questions parsed. Header row: {headers}, header_row_idx: {header_row_idx}, max_row: {ws.max_row}'}
        return {'questions': questions}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel parse failed: {e}")
