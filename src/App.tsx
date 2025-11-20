import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import UploadQuestions from "./pages/UploadQuestions";
import VerifyQuestions from "./pages/VerifyQuestions";
import Templates from "./pages/Templates";
import GeneratePaper from "./pages/GeneratePaper";
import NotFound from "./pages/NotFound";
import React, { useState } from "react";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";
import * as XLSX from "xlsx";

const queryClient = new QueryClient();

const BANNER_TEXT = "Exam Paper Banner";

function App() {
  const [exportFormat, setExportFormat] = useState<"word" | "excel">("word");
  const questions = [
    { question: "What is React?", marks: 5 },
    { question: "Explain useState hook.", marks: 5 },
  ];

  const handleExport = async () => {
    if (exportFormat === "word") {
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: BANNER_TEXT, bold: true, size: 36 }),
                ],
                spacing: { after: 200 },
              }),
              ...questions.map(
                (q, idx) =>
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${idx + 1}. ${q.question} (${q.marks} marks)`,
                        size: 28,
                      }),
                    ],
                  })
              ),
            ],
          },
        ],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, "question-paper.docx");
    } else if (exportFormat === "excel") {
      const wsData = [
        [BANNER_TEXT],
        [],
        ["No.", "Question", "Marks"],
        ...questions.map((q, idx) => [idx + 1, q.question, q.marks]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Exam Paper");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      saveAs(new Blob([wbout], { type: "application/octet-stream" }), "question-paper.xlsx");
    }
  };

  return (
    <div>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/upload" element={<UploadQuestions />} />
              <Route path="/verify" element={<VerifyQuestions />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/generate" element={<GeneratePaper />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
      <div style={{ marginBottom: 16 }}>
        <select
          value={exportFormat}
          onChange={e => setExportFormat(e.target.value as "word" | "excel")}
        >
          <option value="word">Word (.docx)</option>
          <option value="excel">Excel (.xlsx)</option>
        </select>
        <button onClick={handleExport} style={{ marginLeft: 8 }}>
          Export Question Paper
        </button>
      </div>
    </div>
  );
}

export default App;
