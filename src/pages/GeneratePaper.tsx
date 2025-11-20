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

      const sections = template.sections as any[];
      const selectedQuestions: Question[] = [];
      
      sections.forEach((section) => {
        // Get objective questions for this section
        const objectivePool = verifiedQuestions.filter((q) => q.type === "objective");
        const selectedObjective = objectivePool
          .sort(() => Math.random() - 0.5)
          .slice(0, section.objectiveCount);
        
        // Get descriptive questions for this section
        const descriptivePool = verifiedQuestions.filter((q) => q.type === "descriptive");
        const selectedDescriptive = descriptivePool
          .sort(() => Math.random() - 0.5)
          .slice(0, section.descriptiveCount);
        
        selectedQuestions.push(...selectedObjective, ...selectedDescriptive);
      });

      // Generate answer key
      const key = selectedQuestions
        .filter((q) => q.correct_answer)
        .map((q, idx) => ({
          questionNumber: idx + 1,
          answer: q.correct_answer || "",
        }));

      setGeneratedQuestions(selectedQuestions);
      setAnswerKey(key);
      setIsGenerated(true);

      // Save to database
      await supabase.from("generated_papers").insert({
        user_id: user.id,
        template_id: selectedTemplateId,
        questions: selectedQuestions,
        answer_key: key,
      });

      toast({ title: "Success", description: "Question paper generated successfully" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate paper", variant: "destructive" });
    }
  };

  const BANNER_IMAGE_URL = "/banner.jpg"; // Use banner.jpg from public folder

  const downloadPaper = async () => {
    const template = templates.find((t) => t.id === selectedTemplateId);
    const banner = template?.name || "Question Paper";
    const totalMarks = template?.total_marks;
    const instructions = template?.instructions || "Answer all questions";

    if (downloadFormat === "word") {
      let bannerImageBuffer: ArrayBuffer | undefined;
      try {
        const res = await fetch(BANNER_IMAGE_URL);
        if (res.ok) {
          bannerImageBuffer = await res.arrayBuffer();
        }
      } catch {
        bannerImageBuffer = undefined;
      }

      const doc = new Document({
        sections: [
          {
            children: [
              bannerImageBuffer
                ? new Paragraph({
                    children: [
                      new ImageRun({
                        data: bannerImageBuffer,
                        transformation: { width: 600, height: 100 },
                        mimeType: "image/jpeg",
                      }),
                    ],
                    spacing: { after: 200 },
                  })
                : new Paragraph({
                    children: [
                      new TextRun({ text: banner, bold: true, size: 36 }),
                    ],
                    spacing: { after: 200 },
                  }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Total Marks: ${totalMarks}`, size: 28 }),
                ],
                spacing: { after: 100 },
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Instructions: ${instructions}`, size: 24 }),
                ],
                spacing: { after: 200 },
              }),
              ...generatedQuestions.map(
                (q, idx) =>
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `Q${idx + 1}. ${q.question_text} [${q.marks} marks]`,
                        size: 24,
                      }),
                      ...(q.options
                        ? [
                            new TextRun({
                              text: `\n   A) ${(q.options as any).A}\n   B) ${(q.options as any).B}\n   C) ${(q.options as any).C}\n   D) ${(q.options as any).D}`,
                              size: 22,
                            }),
                          ]
                        : []),
                    ],
                    spacing: { after: 150 },
                  })
              ),
              // Add answer key at the end
              new Paragraph({
                children: [
                  new TextRun({
                    text: "\nAnswer Key",
                    bold: true,
                    size: 28,
                  }),
                ],
                spacing: { before: 400, after: 100 },
              }),
              ...answerKey.map((item) =>
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Q${item.questionNumber}: ${item.answer}`,
                      size: 24,
                    }),
                  ],
                  spacing: { after: 80 },
                })
              ),
            ],
          },
        ],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, "question_paper.docx");
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
