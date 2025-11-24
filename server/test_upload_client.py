import pandas as pd
import requests
from io import BytesIO

# Build an Excel file with header on row 3 (index 2)
# We'll create two blank rows, then header row, then data rows

header = ['','Question Bank','', 'TYPE','BTL Level','Course Outcomes','Marks','Part']
# We'll align to columns used by backend: Question Bank, TYPE, BTL Level, Course Outcomes, Marks, Part
# Place header in appropriate columns; keep other cells blank
rows = []
rows.append(['']*len(header))
rows.append(['']*len(header))
rows.append(header)
# Add data rows: a descriptive question with Course Outcomes as numeric '1', and an objective with 'CO 2'
rows.append(['', 'List any two fundamental steps in Algorithmic Problem Solving.', '', 'D', 1, 1, 2, 1])
rows.append(['', 'What is an algorithm?', '', 'O', 1, 'CO 2', 2, 1])

# Create DataFrame and write to Excel
df = pd.DataFrame(rows)
excel_path = 'e:/IDCS-MAIN-main/server/test_questions.xlsx'
df.to_excel(excel_path, index=False, header=False)

# POST the file
url = 'http://127.0.0.1:8000/api/upload-questions-excel/'
with open(excel_path, 'rb') as f:
    files = {'file': ('test_questions.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    resp = requests.post(url, files=files)
    print('Status:', resp.status_code)
    try:
        print(resp.json())
    except Exception:
        print(resp.text)
