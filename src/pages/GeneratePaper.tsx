import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download, FileText, Key } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { Document, Packer, Paragraph, TextRun, ImageRun } from "docx";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

type Template = Tables<"templates">;
type Question = Tables<"question_bank">;

const GeneratePaper = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [answerKey, setAnswerKey] = useState<{ questionNumber: number; answer: string }[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<"word" | "excel">("word");

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("templates")
        .select("*")
        .eq("user_id", user.id);

      setTemplates(data || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to fetch templates", variant: "destructive" });
    }
  };

  const generatePaper = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const template = templates.find((t) => t.id === selectedTemplateId);
      if (!template) {
        toast({ title: "Error", description: "Please select a template", variant: "destructive" });
        return;
      }

      const { data: verifiedQuestions } = await supabase
        .from("question_bank")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "verified");

      if (!verifiedQuestions || verifiedQuestions.length === 0) {
        toast({ title: "Error", description: "No verified questions available", variant: "destructive" });
        return;
      }

      const pickedIds = new Set<string>();
      const generated: Question[] = [];
      const templateSections = (template.sections as any[]) || [];

      templateSections.forEach((section) => {
        const criteriaList = section.questions || [];
        criteriaList.forEach((crit: any) => {
          let pool = verifiedQuestions.filter(q => q.type === crit.type);
          if (crit.co) pool = pool.filter(q => (q as any).course_outcomes === crit.co);
          if (crit.btl) {
            const btlNum = parseInt(String(crit.btl).replace(/[^0-9]/g, ''));
            pool = pool.filter(q => (q as any).btl === btlNum);
          }
          pool = pool.filter(q => !pickedIds.has(q.id));
          if (pool.length === 0) {
            let fallback = verifiedQuestions.filter(q => q.type === crit.type && !pickedIds.has(q.id));
            if (fallback.length === 0) fallback = verifiedQuestions.filter(q => !pickedIds.has(q.id));
            pool = fallback;
          }
          if (pool.length === 0) return; // no match available
          const chosen = pool[Math.floor(Math.random() * pool.length)];
            pickedIds.add(chosen.id);
          (chosen as any).co = crit.co;
          (chosen as any).btl = crit.btl;
          generated.push(chosen);
        });
      });

      if (generated.length === 0) {
        toast({ title: "Error", description: "No questions matched the template criteria", variant: "destructive" });
        return;
      }

      // Answer key
      const key = generated
        .filter(q => q.correct_answer)
        .map((q, idx) => ({ questionNumber: idx + 1, answer: q.correct_answer || "" }));

      setGeneratedQuestions(generated);
      setAnswerKey(key);
      setIsGenerated(true);

      await supabase.from("generated_papers").insert({
        user_id: user.id,
        template_id: selectedTemplateId,
        questions: generated,
        answer_key: key,
      });

      toast({ title: "Success", description: "Question paper generated successfully" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate paper", variant: "destructive" });
    }
  };

  const BANNER_IMAGE_URL = "/banner.jpg"; // Use banner.jpg from public folder
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

  const downloadPaper = async () => {
    const template = templates.find((t) => t.id === selectedTemplateId);
    const banner = template?.name || "Question Paper";
    const totalMarks = template?.total_marks;
    const instructions = template?.instructions || "Answer all questions";

    if (downloadFormat === "word") {
      // Use sensible defaults for metadata
      const meta = {
        dept: "CSE", // or prompt user for department
        cc: "CS3401", // or prompt user for course code
        cn: banner, // or prompt user for course name
        qpcode: "QP123", // or prompt user for code
        exam_title: banner,
        regulation: "Regulation 2024",
        semester: "Second Semester",
      };
      // Map questions to backend format
      const questions = generatedQuestions.map((q, idx) => ({
        number: idx + 1,
        text: q.question_text,
        // co: q.course_outcomes || "CO1", // 'course_outcomes' does not exist on type
        co: (q as any).co || (q as any).courseOutcome || "CO1", // fallback to possible property or default
        btl: (q as any).btl || "BTL1",
        marks: q.marks || 2,
        part: idx < 10 ? "A" : "B",
        or: false,
      }));
      // Prepare form data
      const formData = new FormData();
      formData.append("questions", JSON.stringify(questions));
      Object.entries(meta).forEach(([k, v]) => formData.append(k, v));
      // Fetch docx from backend with error handling
      try {
        const res = await fetch(`${BACKEND_URL}/api/template/generate-docx`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          toast({ title: "Error", description: "Backend responded with an error generating DOCX", variant: "destructive" });
          return;
        }
        const blob = await res.blob();
        saveAs(blob, "question_paper.docx");
      } catch (err: any) {
        toast({ title: "Connection Error", description: "Cannot reach backend. Start the server on port 4000 or set VITE_BACKEND_URL.", variant: "destructive" });
        console.error("DOCX generation fetch failed", err);
      }
    } else if (downloadFormat === "excel") {
      // Banner as first row in Excel
      const wsData = [
        ["", "", "", "", "", ""],
        [{ t: "s", v: banner, s: { font: { bold: true, sz: 18 } } }],
        [`Total Marks: ${totalMarks}`],
        [`Instructions: ${instructions}`],
        [],
        ["No.", "Question", "Marks", "A", "B", "C", "D"],
        ...generatedQuestions.map((q, idx) => [
          idx + 1,
          q.question_text,
          q.marks,
          q.options ? (q.options as any).A : "",
          q.options ? (q.options as any).B : "",
          q.options ? (q.options as any).C : "",
          q.options ? (q.options as any).D : "",
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Question Paper");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      saveAs(new Blob([wbout], { type: "application/octet-stream" }), "question_paper.xlsx");
    }
  };

  const downloadAnswerKey = () => {
    let content = "Answer Key\n\n";
    answerKey.forEach((item) => {
      content += `Q${item.questionNumber}: ${item.answer}\n`;
    });

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "answer_key.txt";
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-primary">Auto Generate Question Paper</h1>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generate Options</CardTitle>
              <CardDescription>Select a template and generate your question paper</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Template</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} ({template.total_marks} marks)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={generatePaper} className="w-full" disabled={!selectedTemplateId}>
                Generate Question Paper
              </Button>
            </CardContent>
          </Card>
            

          {isGenerated && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Generated Question Paper
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-muted p-4 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">Preview</p>
                      <p className="font-semibold mb-2">
                        Total Questions: {generatedQuestions.length}
                      </p>
                      <p className="text-sm">
                        Objective: {generatedQuestions.filter((q) => q.type === "objective").length} | 
                        Descriptive: {generatedQuestions.filter((q) => q.type === "descriptive").length}
                      </p>
                    </div>

                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {generatedQuestions.map((q, idx) => (
                        <div key={idx} className="border rounded-lg p-4">
                          <p className="font-semibold mb-2">
                            Q{idx + 1}. {q.question_text} <span className="text-sm text-muted-foreground">({q.marks} marks)</span>
                          </p>
                          {q.options && (
                            <div className="ml-4 space-y-1 text-sm">
                              <p>A) {(q.options as any).A}</p>
                              <p>B) {(q.options as any).B}</p>
                              <p>C) {(q.options as any).C}</p>
                              <p>D) {(q.options as any).D}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-4">
                      <Label>Download Format</Label>
                      <Select value={downloadFormat} onValueChange={v => setDownloadFormat(v as "word" | "excel")}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Select format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="word">Word (.docx)</SelectItem>
                          <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={downloadPaper} className="w-full">
                      <Download className="w-4 h-4 mr-2" />
                      Download Question Paper
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="w-5 h-5" />
                    Answer Key
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                      {answerKey.map((item) => (
                        <div key={item.questionNumber} className="flex items-center gap-2 text-sm">
                          <span className="font-semibold">Q{item.questionNumber}:</span>
                          <span className="bg-primary/10 px-2 py-1 rounded">{item.answer}</span>
                        </div>
                      ))}
                    </div>

                    <Button onClick={downloadAnswerKey} variant="outline" className="w-full">
                      <Download className="w-4 h-4 mr-2" />
                      Download Answer Key
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default GeneratePaper;
