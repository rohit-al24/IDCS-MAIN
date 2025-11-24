import pandas as pd
import requests
from io import BytesIO

# Build DataFrame: two blank rows, header row, then data
header = ['','Question Bank','', 'TYPE','BTL Level','Course Outcomes','Marks','Part']
rows = []
rows.append(['']*len(header))
rows.append(['']*len(header))
rows.append(header)
rows.append(['', 'List any two fundamental steps in Algorithmic Problem Solving.', '', 'D', 1, 1, 2, 1])
rows.append(['', 'What is an algorithm?', '', 'O', 1, 'CO 2', 2, 1])

df = pd.DataFrame(rows)
# write excel to bytes
bio = BytesIO()
with pd.ExcelWriter(bio, engine='openpyxl') as writer:
    df.to_excel(writer, index=False, header=False)
bio.seek(0)

url = 'http://127.0.0.1:8001/api/upload-questions-excel/'
files = {'file': ('test_questions.xlsx', bio.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
resp = requests.post(url, files=files)
print('Status:', resp.status_code)
try:
    print(resp.json())
except Exception:
    print(resp.text)
