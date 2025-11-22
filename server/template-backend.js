// Dummy backend for template upload/scan
import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();
const upload = multer({ dest: "uploads/" });
app.use(cors());
app.use(express.json());

// POST /api/template/upload
app.post("/api/template/upload", upload.single("file"), (req, res) => {
  // For demo, just return lines of text
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });
  const ext = path.extname(file.originalname).toLowerCase();
  let lines: string[] = [];
  if (ext === ".txt" || ext === ".csv") {
    lines = fs.readFileSync(file.path, "utf-8").split(/\r?\n/).filter(Boolean);
  } else if (ext === ".docx") {
    lines = ["Dummy question from DOCX?"];
  }
  fs.unlinkSync(file.path);
  res.json({ lines });
});

// POST /api/template/scan
app.post("/api/template/scan", (req, res) => {
  const { lines } = req.body;
  // Dummy scan: treat lines ending with ? as questions
  const questions = (lines || []).map((line: string) => {
    let type = "Short Answer";
    if (line.length > 60) type = "Paragraph";
    if (line.includes(",")) type = "Multiple Choice";
    return { questionText: line, questionType: type, options: type === "Multiple Choice" ? line.split(",") : undefined };
  });
  res.json({ questions });
});

app.listen(4000, () => console.log("Dummy backend running on port 4000"));
