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
      let selectedQuestions: Question[] = [];
      let partCQuestions: Question[] = [];
      let partCNumbering: { number: string; q: Question }[] = [];
      sections.forEach((section, sectionIdx) => {
        let sectionQuestions: Question[] = [];
        if (section.questions && Array.isArray(section.questions)) {
          section.questions.forEach((qSpec, qIdx) => {
            // For Part C, filter by Type === 'C' (case-insensitive)
            if (qSpec.type && qSpec.type.toLowerCase() === 'c') {
              const pool = verifiedQuestions.filter((q) => {
                const typeCol = (q.type || "").toString().toUpperCase();
                return typeCol === 'C';
              });
              if (pool.length > 0) {
                const chosen = pool[Math.floor(Math.random() * pool.length)];
                if (chosen.question_text) {
                  chosen.question_text = chosen.question_text.replace(/^\s*[DO]\.[\s-]*/i, "");
                }
                // If this is section 3 (index 2), assign 16A/16B
                if (sectionIdx === 2) {
                  const num = qIdx === 0 ? '16 A' : '16 B';
                  partCNumbering.push({ number: num, q: chosen });
                } else {
                  partCQuestions.push(chosen);
                }
              }
            } else {
              // For other parts, match as before
              const pool = verifiedQuestions.filter((q) => {
                // Try to match CO and BTL with possible property names
                const coVal = (q["course_outcomes"] || "");
                const coMatch = coVal.toUpperCase().includes((qSpec.co || "").toUpperCase());
                const btlVal = (q["btl"] || "");
                const btlMatch = btlVal == qSpec.btl;
                const marksMatch = q.marks == qSpec.marks;
                const typeMatch = !qSpec.type || q.type === qSpec.type;
                return coMatch && btlMatch && marksMatch && typeMatch && ((q.type || '').toLowerCase() !== 'c');
              });
              if (pool.length > 0) {
                const chosen = pool[Math.floor(Math.random() * pool.length)];
                if (chosen.question_text) {
                  chosen.question_text = chosen.question_text.replace(/^\s*[DO]\.[\s-]*/i, "");
                }
                sectionQuestions.push(chosen);
              }
            }
          });
        }
        selectedQuestions = [...selectedQuestions, ...sectionQuestions];
      });
      // Add Part C questions at the end, with 16A/16B if section 3 exists
      if (partCNumbering.length > 0) {
        // Insert as objects with number property for later use if needed
        selectedQuestions = [...selectedQuestions, ...partCNumbering.map((item) => ({ ...item.q, number: item.number }))];
      } else {
        selectedQuestions = [...selectedQuestions, ...partCQuestions];
      }

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

  const downloadPaper = () => {
    const template = templates.find((t) => t.id === selectedTemplateId);
    let content = `${template?.name || "Question Paper"}\n`;
    content += `Total Marks: ${template?.total_marks}\n\n`;
    content += `Instructions: ${template?.instructions || "Answer all questions"}\n\n`;
    content += "=".repeat(80) + "\n\n";

    generatedQuestions.forEach((q, idx) => {
      content += `Q${idx + 1}. ${q.question_text} [${q.marks} marks]\n`;
      if (q.options) {
        const opts = q.options as any;
        content += `   A) ${opts.A}\n   B) ${opts.B}\n   C) ${opts.C}\n   D) ${opts.D}\n`;
      }
      content += "\n";
    });

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "question_paper.txt";
    a.click();
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
