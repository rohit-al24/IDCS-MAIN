import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
type BTLLevel = 1 | 2 | 3 | 4 | 5 | 6;
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Plus, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

type QuestionType = "objective" | "mcq" | "descriptive";
interface Question {
  id?: string;
  question_text: string;
  type: QuestionType;
  btl_level: BTLLevel;
  unit?: number | null;
  options?: { A: string; B: string; C: string; D: string } | null;
  correct_answer?: string | null;
  marks: number;
}
const UploadQuestions = () => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [manualQuestion, setManualQuestion] = useState<Question>({
      question_text: "",
      type: "objective",
      btl_level: 1,
      marks: 1,
      options: { A: "", B: "", C: "", D: "" },
      correct_answer: "",
      unit: 1,
    });
    const [isManualEntry, setIsManualEntry] = useState(false);
    const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
    const navigate = useNavigate();
    const { toast } = useToast();

    // Save a single question
    const resolveBackendBase = () => {
      const envBase = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
      const normalize = (raw?: string) => {
        if (!raw) return '';
        if (/^:?[0-9]+$/.test(raw)) return `http://localhost${raw.startsWith(':')?raw:':' + raw}`;
        if (!/^https?:\/\//i.test(raw)) return `http://${raw}`;
        return raw.replace(/\/$/, '');
      };
      const primary = normalize(envBase) || 'http://localhost:4000';
      return [primary, 'http://localhost:8000'];
    };
    const ensureTitleId = async (title: string): Promise<number> => {
      const bases = resolveBackendBase();
      for (const base of bases) {
        try {
          const fd = new FormData(); fd.append('title', title);
            const resp = await fetch(`${base}/api/question-bank-titles`, { method: 'POST', body: fd });
            if (!resp.ok) continue;
            const data = await resp.json();
            if (data && typeof data.id === 'number') return data.id;
        } catch {}
      }
      throw new Error('Failed to create/fetch title');
    };
    const saveSingleQuestion = async (question: Question) => {
      try {
        const titleId = await ensureTitleId('default');
        // Include image_url or image if present in the question object
        const payload: any = {
          question_text: question.question_text,
          type: question.type,
          options: question.options || null,
          correct_answer: question.correct_answer || null,
          answer_text: question.correct_answer || '',
          btl: question.btl_level,
          marks: question.marks,
          chapter: question.unit != null ? String(question.unit) : null,
          course_outcomes: null
        };
        if ((question as any).image_url) payload.image_url = (question as any).image_url;
        if ((question as any).image) payload.image = (question as any).image;
        const payloadArr = [payload];
        const bases = resolveBackendBase();
        let lastErr: any = null;
        for (const base of bases) {
          try {
            const fd = new FormData();
            fd.append('title_id', String(titleId));
            fd.append('status', 'pending');
            fd.append('payload', JSON.stringify(payloadArr));
            const resp = await fetch(`${base}/api/question-bank/bulk`, { method: 'POST', body: fd });
            if (!resp.ok) {
              let det = `HTTP ${resp.status}`; try { const j = await resp.json(); det = j.detail || det; } catch {}
              throw new Error(det);
            }
            await resp.json();
            toast({ title: 'Question saved', description: 'Saved locally' });
            return;
          } catch (err) { lastErr = err; }
        }
        throw lastErr || new Error('Backend unreachable');
      } catch (err: any) {
        toast({ title: 'Error', description: err?.message || 'Failed to save question', variant: 'destructive' });
      }
    };

    // Remove a question from the list
    const removeQuestion = (index: number) => {
      setQuestions(questions.filter((_, i) => i !== index));
    };

    // Add a manual question
    const addManualQuestion = () => {
      setQuestions([...questions, { ...manualQuestion }]);
    };

    // Handle file upload: send Excel to backend if .xlsx, else parse CSV/TXT locally
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const isExcel = file.name.endsWith('.xlsx') || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (isExcel) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          // Use backend base URL logic from resolveBackendBase
          const bases = resolveBackendBase();
          let lastErr: any = null;
          for (const base of bases) {
            try {
              const resp = await fetch(`${base}/api/upload-questions-excel/`, { method: 'POST', body: fd });
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
              const data = await resp.json();
              // Expecting data.questions: [{...}]
              if (Array.isArray(data.questions)) {
                // Map backend fields to Question type
                const parsed: Question[] = data.questions.map((q: any, idx: number) => ({
                  question_text: q['Question Bank'] || q.question_text || `Question ${idx + 1}`,
                  type: (q.TYPE || q.type || 'objective').toLowerCase(),
                  options: null, // Optionally map if present
                  correct_answer: q.correct_answer || null,
                  btl_level: parseInt(q['BTL Level'] || q.btl_level || '1') as BTLLevel,
                  marks: parseInt(q.Marks || q.marks || '1'),
                  unit: q.unit ? parseInt(q.unit) : 1,
                }));
                setQuestions(parsed);
                toast({ title: 'File uploaded', description: `${parsed.length} questions parsed from Excel` });
                return;
              }
            } catch (err) { lastErr = err; }
          }
          throw lastErr || new Error('Backend unreachable');
        } catch (err: any) {
          toast({ title: 'Error', description: err?.message || 'Failed to parse Excel file', variant: 'destructive' });
        }
      } else {
        // Fallback: parse CSV/TXT locally
        try {
          const text = await file.text();
          const lines = text.split("\n").filter(line => line.trim());
          if (lines.length < 2) {
            toast({ title: 'Error', description: 'No questions found in file', variant: 'destructive' });
            return;
          }
          const parsed: Question[] = lines.slice(1).map((line, idx) => {
            const parts = line.split(',').map(p => p.trim());
            return {
              question_text: parts[0] || `Question ${idx + 1}`,
              type: (parts[1]?.toLowerCase() as QuestionType) || 'objective',
              options: (parts[1]?.toLowerCase() === 'objective' || parts[1]?.toLowerCase() === 'mcq') ? {
                A: parts[2] || '',
                B: parts[3] || '',
                C: parts[4] || '',
                D: parts[5] || '',
              } : null,
              correct_answer: parts[6] || null,
              btl_level: (parseInt(parts[7]) as BTLLevel) || 1,
              marks: parseInt(parts[8]) || 1,
              unit: parts[9] ? parseInt(parts[9]) : 1,
            };
          });
          setQuestions(parsed);
          toast({ title: 'File uploaded', description: `${parsed.length} questions parsed` });
        } catch (err: any) {
          toast({ title: 'Error', description: 'Failed to parse file', variant: 'destructive' });
        }
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
        <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Button onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
            </Button>
            <h1 className="text-2xl font-bold text-primary">Upload Question Bank</h1>
            {questions.length > 0 && (
              <Button onClick={() => {
                // Save all questions in bulk
                questions.forEach(saveSingleQuestion);
              }}>Save All Questions</Button>
            )}
          </div>
        </nav>
        <main className="container mx-auto px-4 py-8">
          <div className="grid gap-6 mb-8">
            <div className="bg-card rounded-lg shadow p-6">
              <div className="flex gap-4 mb-4">
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                    <Upload className="w-4 h-4" /> Upload CSV File
                  </div>
                </Label>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => setIsManualEntry(!isManualEntry)}>
                  <Plus className="w-4 h-4 mr-2" /> Add Question Manually
                </Button>
              </div>
              {isManualEntry && (
                <div className="bg-muted rounded p-4 mb-4">
                  <div className="mb-2">
                    <Label>Question Text</Label>
                    <Textarea
                      value={manualQuestion.question_text}
                      onChange={(e) => setManualQuestion({ ...manualQuestion, question_text: e.target.value })}
                      placeholder="Enter question text"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <div>
                      <Label>Type</Label>
                      <Select
                        value={manualQuestion.type}
                        onValueChange={(value: QuestionType) => setManualQuestion({ ...manualQuestion, type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="objective">Objective</SelectItem>
                          <SelectItem value="mcq">MCQ</SelectItem>
                          <SelectItem value="descriptive">Descriptive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>BTL Level</Label>
                      <Select
                        value={manualQuestion.btl_level.toString()}
                        onValueChange={(value) => setManualQuestion({ ...manualQuestion, btl_level: parseInt(value) as BTLLevel })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="6">6</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <div>
                      <Label>Marks</Label>
                      <Input
                        type="number"
                        value={manualQuestion.marks}
                        onChange={(e) => setManualQuestion({ ...manualQuestion, marks: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    <div>
                      <Label>Unit</Label>
                      <Select
                        value={manualQuestion.unit?.toString() || "1"}
                        onValueChange={(value) => setManualQuestion({ ...manualQuestion, unit: parseInt(value) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                          <SelectItem value="5">5</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {(manualQuestion.type === "objective" || manualQuestion.type === "mcq") && (
                    <div className="grid grid-cols-2 gap-4 mb-2">
                      <div>
                        <Label>Option A</Label>
                        <Input
                          value={manualQuestion.options?.A || ""}
                          onChange={(e) => setManualQuestion({ ...manualQuestion, options: { ...manualQuestion.options!, A: e.target.value } })}
                        />
                      </div>
                      <div>
                        <Label>Option B</Label>
                        <Input
                          value={manualQuestion.options?.B || ""}
                          onChange={(e) => setManualQuestion({ ...manualQuestion, options: { ...manualQuestion.options!, B: e.target.value } })}
                        />
                      </div>
                      <div>
                        <Label>Option C</Label>
                        <Input
                          value={manualQuestion.options?.C || ""}
                          onChange={(e) => setManualQuestion({ ...manualQuestion, options: { ...manualQuestion.options!, C: e.target.value } })}
                        />
                      </div>
                      <div>
                        <Label>Option D</Label>
                        <Input
                          value={manualQuestion.options?.D || ""}
                          onChange={(e) => setManualQuestion({ ...manualQuestion, options: { ...manualQuestion.options!, D: e.target.value } })}
                        />
                      </div>
                      <div>
                        <Label>Correct Answer</Label>
                        <Select
                          value={manualQuestion.correct_answer || ""}
                          onValueChange={(value) => setManualQuestion({ ...manualQuestion, correct_answer: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A">A</SelectItem>
                            <SelectItem value="B">B</SelectItem>
                            <SelectItem value="C">C</SelectItem>
                            <SelectItem value="D">D</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <Button onClick={addManualQuestion}>Add Question</Button>
                    <Button variant="outline" onClick={() => setIsManualEntry(false)}>Cancel</Button>
                  </div>
                </div>
              )}
              {questions.length > 0 && (
                <div className="overflow-x-auto mt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Question Text</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>BTL Level</TableHead>
                        <TableHead>Marks</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {questions.map((q, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell className="max-w-md truncate">{q.question_text}</TableCell>
                          <TableCell className="capitalize">{q.type}</TableCell>
                          <TableCell>{q.btl_level}</TableCell>
                          <TableCell>{q.marks}</TableCell>
                          <TableCell>{q.unit ?? "-"}</TableCell>
                          <TableCell className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => saveSingleQuestion(q)}
                              title="Save question"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-green-600">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1" />
                              </svg>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeQuestion(idx)}
                              title="Remove question"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  };

  export default UploadQuestions;