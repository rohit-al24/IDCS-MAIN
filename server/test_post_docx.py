import requests
import json

URL = "http://127.0.0.1:4000/api/template/generate-docx"
# 1x1 PNG base64 (transparent)
PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="

questions = [
    {
        "baseNumber": 1,
        "sub": "a",
        "question_text": "Test question with image",
        "marks": 2,
        "type": "descriptive",
        "course_outcomes": "CO1",
        "btl": 2,
        "image_url": PNG_1x1
    }
]

form = {
    "questions": json.dumps(questions),
    "dept": "CSE",
    "cc": "CS101",
    "cn": "Test Course",
    "qpcode": "QP_TEST",
    "exam_title": "Test Exam",
    "regulation": "Reg 2025",
    "semester": "First Semester"
}

print(f"Posting to {URL} with {len(questions)} question(s)")
resp = requests.post(URL, data=form, timeout=60)
print("Status:", resp.status_code)
print("Headers:", resp.headers.get('content-type'), resp.headers.get('content-disposition'))
if resp.ok:
    path = "server/test_output.docx"
    with open(path, "wb") as f:
        f.write(resp.content)
    print(f"Saved {len(resp.content)} bytes to {path}")
else:
    print(resp.text)
