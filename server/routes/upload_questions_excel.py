from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List
from openpyxl import load_workbook
from io import BytesIO
import re
import zipfile
import os
import xml.etree.ElementTree as ET
import posixpath

router = APIRouter()

@router.post("/upload-questions-excel/")
def upload_questions_excel(file: UploadFile = File(...)):
    try:
        data = file.file.read()
        wb = load_workbook(BytesIO(data), data_only=True)
        ws = wb.active
        header_row_idx = 3
        required = ["Question Bank", "TYPE", "BTL Level", "Course Outcomes", "Marks", "Part"]
        # Find headers anywhere in the header row, not just first columns
        headers = [str(ws.cell(row=header_row_idx, column=c).value).strip() if ws.cell(row=header_row_idx, column=c).value is not None else '' for c in range(1, ws.max_column + 1)]
        def norm(s):
            return re.sub(r"\s+", "", s or "").replace("\n","").replace("\r","").lower()
        norm_headers = [norm(h) for h in headers]
        header_map = {}
        used_indices = set()
        for col in required:
            norm_col = norm(col)
            found = False
            for idx, h in enumerate(norm_headers):
                if idx in used_indices:
                    continue
                if norm_col in h or h in norm_col:
                    header_map[col] = idx+1  # column is 1-based
                    used_indices.add(idx)
                    found = True
                    break
            if not found:
                raise HTTPException(status_code=400, detail=f"Missing required column: {col}. Found headers: {headers}")

        # --- IMAGE TO CELL MAPPING ---
        # openpyxl stores images in ws._images, anchor._from gives 0-based row/col.
        # Images can be floating; we map each image to the nearest preceding non-empty "Question Bank" cell.
        q_col_idx = header_map.get('Question Bank')
        image_cell_map = {}  # map from (row, col) -> image object
        image_row_map = {}   # map from question_row -> image object (one image per question row)
        try:
            from openpyxl.utils import coordinate_to_tuple
        except ImportError:
            def coordinate_to_tuple(cell):
                # fallback: parse 'A1' to (row, col)
                import re
                m = re.match(r"([A-Z]+)([0-9]+)", cell)
                if m:
                    col = 0
                    for c in m.group(1):
                        col = col * 26 + (ord(c) - ord('A') + 1)
                    return (int(m.group(2)), col)
                return (1, 1)

        imgs = list(getattr(ws, '_images', []))
        print(f"[Excel Debug] Found {len(imgs)} images on sheet")
        # If openpyxl didn't expose images, try reading the .xlsx zip parts (/xl/drawings and /xl/media)
        try:
            if len(imgs) == 0:
                z = zipfile.ZipFile(BytesIO(data))
                print(f"[Excel Debug ZIP] zip contains {len(z.namelist())} entries")
                # optionally print some entries for debugging (limited)
                sample = z.namelist()[:40]
                print(f"[Excel Debug ZIP] sample entries: {sample}")
                # find the sheet xml corresponding to this worksheet
                try:
                    sheet_index = wb.sheetnames.index(ws.title) + 1
                except Exception:
                    sheet_index = 1
                sheet_path = f'xl/worksheets/sheet{sheet_index}.xml'
                if sheet_path in z.namelist():
                    print(f"[Excel Debug ZIP] found sheet path: {sheet_path}")
                    sheet_xml = z.read(sheet_path)
                    st = ET.fromstring(sheet_xml)
                    # namespace for sheet drawing
                    ns_sheet = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
                    drawing_elem = st.find('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}drawing')
                    print(f"[Excel Debug ZIP] drawing_elem: {drawing_elem}")
                    if drawing_elem is not None:
                        rId = drawing_elem.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
                        print(f"[Excel Debug ZIP] drawing rId: {rId}")
                        # read sheet rels to find drawing target
                        rels_path = f'xl/worksheets/_rels/sheet{sheet_index}.xml.rels'
                        print(f"[Excel Debug ZIP] looking for rels at: {rels_path} (exists={rels_path in z.namelist()})")
                        if rels_path in z.namelist():
                            rels_doc = ET.fromstring(z.read(rels_path))
                            draw_target = None
                            for rel in rels_doc.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                                print(f"[Excel Debug ZIP] sheet rel: Id={rel.attrib.get('Id')} Target={rel.attrib.get('Target')}")
                                if rel.attrib.get('Id') == rId:
                                    draw_target = rel.attrib.get('Target')
                                    break
                            print(f"[Excel Debug ZIP] draw_target={draw_target}")
                            if draw_target:
                                # normalize path e.g. ../drawings/drawing1.xml -> xl/drawings/drawing1.xml
                                # prefer forward slashes for ZIP entries
                                if draw_target.startswith('../'):
                                    drawing_path = 'xl/' + draw_target.replace('../', '')
                                else:
                                    drawing_path = 'xl/' + draw_target.lstrip('./')
                                drawing_path = drawing_path.replace('\\', '/').replace('//', '/')
                                print(f"[Excel Debug ZIP] drawing_path normalized: {drawing_path} (exists={drawing_path in z.namelist()})")
                                if drawing_path in z.namelist():
                                    drawing_xml = ET.fromstring(z.read(drawing_path))
                                    # build rels for drawing (map rId -> media target)
                                    drawing_rels_path = os.path.dirname(drawing_path).rstrip('/') + '/_rels/' + os.path.basename(drawing_path) + '.rels'
                                    drawing_rels_path = drawing_rels_path.replace('\\', '/').replace('//', '/')
                                    print(f"[Excel Debug ZIP] drawing_rels_path: {drawing_rels_path} (exists={drawing_rels_path in z.namelist()})")
                                    rels_map = {}
                                    if drawing_rels_path in z.namelist():
                                        dr = ET.fromstring(z.read(drawing_rels_path))
                                        for rel in dr.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                                            Id = rel.attrib.get('Id')
                                            Target = rel.attrib.get('Target')
                                            print(f"[Excel Debug ZIP] drawing rel: Id={Id} Target={Target}")
                                            if Id and Target:
                                                # resolve relative target against drawing directory using posix normalization
                                                rel_base = os.path.dirname(drawing_path).replace('\\', '/').rstrip('/')
                                                # Target may be like '../media/image1.png' or 'media/image1.png'
                                                combined = posixpath.normpath(posixpath.join(rel_base, Target)).replace('\\', '/')
                                                # ensure it starts with xl/
                                                if not combined.startswith('xl/'):
                                                    combined = combined.lstrip('/')
                                                    combined = 'xl/' + combined
                                                rels_map[Id] = combined
                                    print(f"[Excel Debug ZIP] rels_map keys: {list(rels_map.keys())}")

                                    # iterate anchors
                                    xdr_ns = '{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}'
                                    a_ns = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
                                    anchors = drawing_xml.findall('.//'+xdr_ns+'twoCellAnchor') + drawing_xml.findall('.//'+xdr_ns+'oneCellAnchor')
                                    print(f"[Excel Debug ZIP] found {len(anchors)} anchors in drawing_xml")
                                    for anchor in anchors:
                                        # find from row/col
                                        frm = anchor.find('.//'+xdr_ns+'from')
                                        if frm is None:
                                            continue
                                        col_elem = frm.find('./'+xdr_ns+'col')
                                        row_elem = frm.find('./'+xdr_ns+'row')
                                        if col_elem is None or row_elem is None:
                                            continue
                                        try:
                                            a_col = int(col_elem.text) + 1
                                            a_row = int(row_elem.text) + 1
                                        except Exception:
                                            continue
                                        # find blip embed id
                                        blip = anchor.find('.//'+xdr_ns+'pic//'+xdr_ns+'blipFill//'+a_ns+'blip')
                                        if blip is None:
                                            blip = anchor.find('.//'+xdr_ns+'blipFill//'+a_ns+'blip')
                                        if blip is None:
                                            print(f"[Excel Debug ZIP] no blip for anchor at ({a_row},{a_col})")
                                            continue
                                        embed = blip.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                                        print(f"[Excel Debug ZIP] anchor at ({a_row},{a_col}) embed={embed}")
                                        if not embed:
                                            continue
                                        media_target = rels_map.get(embed)
                                        print(f"[Excel Debug ZIP] media_target for embed {embed}: {media_target}")
                                        if not media_target:
                                            continue
                                        # normalize media path (use forward slashes, avoid duplicate xl/ prefixes)
                                        media_path = str(media_target).replace('\\', '/').replace('//', '/')
                                        # remove any leading ./ or ../ segments
                                        while media_path.startswith('./') or media_path.startswith('../'):
                                            if media_path.startswith('../'):
                                                media_path = media_path[3:]
                                            elif media_path.startswith('./'):
                                                media_path = media_path[2:]
                                        if not media_path.startswith('xl/'):
                                            media_path = 'xl/' + media_path.lstrip('/')
                                        # collapse accidental duplicates
                                        media_path = media_path.replace('xl/xl/', 'xl/')
                                        print(f"[Excel Debug ZIP] normalized media_path: {media_path} (exists={media_path in z.namelist()})")
                                        if media_path in z.namelist():
                                            media_bytes = z.read(media_path)
                                            # store a lightweight image dict for later handling
                                            image_cell_map[(a_row, a_col)] = {'bytes': media_bytes, 'anchor_row': a_row, 'anchor_col': a_col}
                                            # map to the nearest non-empty question row across the sheet
                                            target_row = a_row
                                            try:
                                                candidate_rows = []
                                                if q_col_idx is not None:
                                                    for rr in range(header_row_idx + 1, ws.max_row + 1):
                                                        v = ws.cell(row=rr, column=q_col_idx).value
                                                        if v is not None and str(v).strip() != '':
                                                            candidate_rows.append(rr)
                                                if candidate_rows:
                                                    # pick the nearest row by absolute distance
                                                    target_row = min(candidate_rows, key=lambda x: abs(x - a_row))
                                                else:
                                                    # fallback to nearest within +/- 50 rows
                                                    lo = max(header_row_idx + 1, a_row - 50)
                                                    hi = min(ws.max_row, a_row + 50)
                                                    target_row = a_row
                                                    for rr in range(lo, hi + 1):
                                                        v = ws.cell(row=rr, column=q_col_idx).value if q_col_idx is not None else None
                                                        if v is not None and str(v).strip() != '':
                                                            target_row = rr
                                                            break
                                            except Exception:
                                                target_row = a_row
                                            if target_row not in image_row_map:
                                                # Always include the image bytes for later base64 encoding
                                                image_row_map[target_row] = {
                                                    'anchor_row': a_row,
                                                    'anchor_col': a_col,
                                                    'bytes': media_bytes
                                                }
                                            print(f"[Excel Debug ZIP] Image media {media_path} anchor ({a_row},{a_col}) -> question_row {target_row}")
        except Exception as e:
            print(f"[Excel Debug] ZIP parse failed: {e}")
        for img in imgs:
            anchor = getattr(img, 'anchor', None)
            if anchor is None:
                continue
            # openpyxl >= 3.0: anchor._from has row, col (0-based)
            if hasattr(anchor, '_from'):
                a_row = anchor._from.row + 1
                a_col = anchor._from.col + 1
            elif hasattr(anchor, 'cell'):
                a_row, a_col = coordinate_to_tuple(anchor.cell)
            else:
                # unknown anchor format
                continue
            # Map to the nearest non-empty Question Bank cell across the sheet (more robust than upward-only)
            target_row = a_row
            q_col_idx = header_map.get('Question Bank')
            if q_col_idx is not None:
                try:
                    candidate_rows = [rr for rr in range(header_row_idx + 1, ws.max_row + 1) if ws.cell(row=rr, column=q_col_idx).value is not None and str(ws.cell(row=rr, column=q_col_idx).value).strip() != '']
                    if candidate_rows:
                        target_row = min(candidate_rows, key=lambda x: abs(x - a_row))
                    else:
                        # fallback: try within +/-50 rows
                        lo = max(header_row_idx + 1, a_row - 50)
                        hi = min(ws.max_row, a_row + 50)
                        for rr in range(lo, hi + 1):
                            if ws.cell(row=rr, column=q_col_idx).value is not None and str(ws.cell(row=rr, column=q_col_idx).value).strip() != '':
                                target_row = rr
                                break
                except Exception:
                    target_row = a_row
            # store mapping
            image_cell_map[(a_row, a_col)] = img
            # prefer mapping to the question row (target_row)
            if target_row not in image_row_map:
                image_row_map[target_row] = img
            print(f"[Excel Debug] Image anchor at ({a_row},{a_col}) mapped -> question_row {target_row}")

        questions = []
        q_col_idx = header_map.get('Question Bank')
        for r in range(header_row_idx + 1, ws.max_row + 1):
            # Primary question text is taken from the mapped Question Bank column
            qtext = ''
            q_source_row = r
            q_source_col = q_col_idx
            if q_col_idx:
                qcell_val = ws.cell(row=r, column=q_col_idx).value
                qtext = str(qcell_val).strip() if qcell_val is not None else ''
            # Fallback: if empty, search upwards then downwards up to 5 rows for merged/shifted question text
            if not qtext and q_col_idx:
                found = False
                for d in range(1, 6):
                    rr = r - d
                    if rr > header_row_idx:
                        val = ws.cell(row=rr, column=q_col_idx).value
                        if val is not None and str(val).strip() != '':
                            qtext = str(val).strip()
                            q_source_row = rr
                            found = True
                            break
                if not found:
                    for d in range(1, 6):
                        rr = r + d
                        if rr <= ws.max_row:
                            val = ws.cell(row=rr, column=q_col_idx).value
                            if val is not None and str(val).strip() != '':
                                qtext = str(val).strip()
                                q_source_row = rr
                                break
            if not qtext:
                # no question text found for this row
                continue

            # If qtext is just a small number or too short, try to find a better candidate in the same row
            def is_numeric_short(s: str) -> bool:
                s2 = s.strip()
                if not s2:
                    return True
                if re.fullmatch(r"\d+", s2):
                    return True
                if len(s2) <= 3:
                    return True
                return False

            if is_numeric_short(qtext):
                best = None
                best_len = 0
                # search across all columns in the same row for a likely question (prefer longer text)
                for c in range(1, ws.max_column + 1):
                    if c == q_col_idx:
                        continue
                    v = ws.cell(row=r, column=c).value
                    if v is None:
                        continue
                    s = str(v).strip()
                    if s and not re.fullmatch(r"\d+", s) and len(s) > best_len:
                        best = (s, c)
                        best_len = len(s)
                if best:
                    qtext, q_source_col = best[0], best[1]
                else:
                    # search nearby rows (up to 3) in case the row holds only numbers but question text is merged above/below
                    found = False
                    for d in range(1, 4):
                        for rr in (r - d, r + d):
                            if rr <= header_row_idx or rr > ws.max_row:
                                continue
                            for c in range(1, ws.max_column + 1):
                                v = ws.cell(row=rr, column=c).value
                                if v is None:
                                    continue
                                s = str(v).strip()
                                if s and not re.fullmatch(r"\d+", s) and len(s) > 3:
                                    qtext = s
                                    q_source_row = rr
                                    q_source_col = c
                                    found = True
                                    break
                            if found:
                                break
                        if found:
                            break

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
                btl_nums = re.findall(r'\d+', btl_str)
                if btl_nums:
                    btl = int(max(btl_nums, key=int))

            marks_raw = ws.cell(row=r, column=header_map['Marks']).value
            try:
                marks = int(marks_raw) if marks_raw is not None else 1
            except Exception:
                marks = 1

            co_raw = str(ws.cell(row=r, column=header_map['Course Outcomes']).value or '').replace('\n',' ').replace('\r',' ').strip()
            co = None
            if co_raw:
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

            # Attach image if present. Try mapping by the question source row first (where text was found),
            # then by the current row, then by explicit anchor positions in image_cell_map.
            image_data = None
            img = None
            # check by q_source_row
            if q_source_row in image_row_map:
                img = image_row_map[q_source_row]
                mapped_row = q_source_row
            elif r in image_row_map:
                img = image_row_map[r]
                mapped_row = r
            else:
                # as a fallback, check exact anchor positions for this row
                mapped_row = None
                for c in range(1, ws.max_column + 1):
                    if (r, c) in image_cell_map:
                        img = image_cell_map[(r, c)]
                        mapped_row = r
                        break
                    if (q_source_row, c) in image_cell_map:
                        img = image_cell_map[(q_source_row, c)]
                        mapped_row = q_source_row
                        break

            image_anchor_row = None
            image_anchor_col = None
            image_present = False
            if img is not None:
                print(f"[Excel Debug] Attaching image for question row {r} (source_row={q_source_row})")
                # record anchor coords if available
                # handle dict-based images (from ZIP parsing) and openpyxl Image objects
                import base64
                img_bytes = None
                if isinstance(img, dict):
                    image_anchor_row = img.get('anchor_row')
                    image_anchor_col = img.get('anchor_col')
                    img_bytes = img.get('bytes')
                else:
                    anchor = getattr(img, 'anchor', None)
                    if anchor is not None:
                        if hasattr(anchor, '_from'):
                            image_anchor_row = anchor._from.row + 1
                            image_anchor_col = anchor._from.col + 1
                        elif hasattr(anchor, 'cell'):
                            rr, cc = coordinate_to_tuple(anchor.cell)
                            image_anchor_row = rr
                            image_anchor_col = cc

                    # Convert image to base64 for preview for openpyxl image object
                    for attr in ('_data', 'image', 'ref', 'blob'):
                        v = getattr(img, attr, None)
                        if v:
                            if isinstance(v, bytes):
                                img_bytes = v
                                break
                            try:
                                if hasattr(v, 'tobytes'):
                                    img_bytes = v.tobytes()
                                    break
                                if hasattr(v, 'read'):
                                    img_bytes = v.read()
                                    break
                            except Exception:
                                pass
                    # final fallback: try __dict__ inspect
                    if img_bytes is None:
                        try:
                            v = getattr(img, '_data', None)
                            if v is not None:
                                if hasattr(v, 'tobytes'):
                                    img_bytes = v.tobytes()
                                elif isinstance(v, bytes):
                                    img_bytes = v
                        except Exception:
                            img_bytes = None

                if img_bytes:
                    image_present = True
                    # Debug: print first 32 bytes of image
                    print('[Excel Debug] img_bytes[:32]:', img_bytes[:32])
                    # naive format detection
                    fmt = 'png'
                    if img_bytes[:3] == b'\xff\xd8\xff':
                        fmt = 'jpeg'
                    # Only encode if PNG or JPEG signature is present
                    if img_bytes[:8] == b'\x89PNG\r\n\x1a\n' or img_bytes[:3] == b'\xff\xd8\xff':
                        image_data = f"data:image/{fmt};base64," + base64.b64encode(img_bytes).decode('utf-8')
                    else:
                        print('[Excel Debug] WARNING: Image bytes do not start with PNG or JPEG signature, skipping image.')
                        image_data = None

            questions.append({
                'question_text': qtext,
                'type': qtype,
                'btl': btl,
                'marks': marks,
                'course_outcomes': co,
                'chapter': chapter,
                'image': image_data,
                'question_source_row': q_source_row,
                'question_source_col': q_source_col,
                'image_anchor_row': image_anchor_row,
                'image_anchor_col': image_anchor_col,
                'image_mapped_row': mapped_row,
                'image_present': image_present,
            })
        if not questions:
            print("[Excel Debug] No questions parsed.")
            print(f"Header row index: {header_row_idx}")
            print(f"Headers found: {headers}")
            print(f"Header map: {header_map}")
            print(f"Max row: {ws.max_row}")
            return {
                'questions': [],
                'warning': (
                    f'No questions parsed.\n'
                    f'Header row index: {header_row_idx}\n'
                    f'Headers found: {headers}\n'
                    f'Max row: {ws.max_row}\n'
                    f'Header map: {header_map}\n'
                    f'If you see this, check that your header row matches required columns exactly and that data starts after the header.'
                )
            }
        return {'questions': questions}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel parse failed: {e}")
