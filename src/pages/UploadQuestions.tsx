import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Upload, Plus, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { saveAs } from "file-saver";

type QuestionType = "objective" | "mcq" | "descriptive";
type BTLLevel = 1 | 2 | 3;

interface Question {
  id?: string;
  question_text: string;
  type: QuestionType;
  options?: { A: string; B: string; C: string; D: string } | null;
  correct_answer?: string | null;
  btl: BTLLevel;
  marks: number;
  unit?: string | null;
  topic?: string | null;
  chapter?: string | null;
  course_outcomes?: string | null;
}

const UploadQuestions = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [manualQuestion, setManualQuestion] = useState<Question>({
    question_text: "",
    type: "objective",
    btl: 2,
    marks: 1,
    options: { A: "", B: "", C: "", D: "" },
    correct_answer: "",
    unit: "",
    topic: "",
    chapter: "",
    course_outcomes: "",
  });
  const [isTitleDialogOpen, setIsTitleDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const fileNameRef = useRef<string>("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    fileNameRef.current = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
    setTitle(fileNameRef.current);

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Use the third row (index 2) as header
    const header: string[] = (rows[2] || []).map((h: any) => (h ? h.toString().trim() : ""));
    // Only consider the next rows as data
    const dataRows = rows.slice(3);

    // Define the six columns to extract (adjust names as per your Excel header)
    const requiredColumns = [
      "Question Bank", // question_text
      "TYPE",          // type
      "BTL Level",     // btl
      "Course Outcomes", // course_outcomes
      "Marks",         // marks
      "Part"           // chapter (or as needed)
    ];

    // Map header indices, handle undefined headers
    const colIdx: Record<string, number> = {};
    let missingColumns: string[] = [];
    requiredColumns.forEach(col => {
      const idx = header.findIndex(h => (h || "").toLowerCase() === col.toLowerCase());
      colIdx[col] = idx;
      if (idx === -1) missingColumns.push(col);
    });

    if (missingColumns.length > 0) {
      toast({
        title: "Error",
        description: `Missing columns in Excel: ${missingColumns.join(", ")}`,
        variant: "destructive"
      });
      return;
    }

    const parsed: Question[] = dataRows

      .filter(row => row && row.length > 0 && row[colIdx[requiredColumns[0]]] && row[colIdx[requiredColumns[0]]].toString().trim())
      .map((row, idx) => {
        // Get BTL Level as number
        let btl: BTLLevel = 2;
        const btlStr = row[colIdx["BTL Level"]]?.toString().trim();
        if (btlStr === "1") btl = 1;
        else if (btlStr === "2") btl = 2;
        else if (btlStr === "3") btl = 3;

        // Determine type from TYPE column
        let type: QuestionType | undefined = undefined;
        const typeStr = row[colIdx["TYPE"]]?.toString().trim().toLowerCase();
        if (typeStr === "o") type = "objective";
        else if (typeStr === "d") type = "descriptive";

        // Only include if type is recognized
        if (!type) return null;

        return {
          question_text: row[colIdx["Question Bank"]]?.toString().trim() || `Question ${idx + 1}`,
          type,
          btl,
          marks: parseInt(row[colIdx["Marks"]]) || 1,
          course_outcomes: row[colIdx["Course Outcomes"]]?.toString().trim() || null,
          chapter: row[colIdx["Part"]]?.toString().trim() || null,
        };
      })
      .filter(Boolean); // Remove nulls for unrecognized types

    setQuestions(parsed);
    toast({ title: "File uploaded", description: `${parsed.length} questions parsed from Excel` });
  };


  const handleSelectQuestion = (idx: number) => {
    setSelectedQuestions((prev) =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const saveQuestions = async () => {
    setIsTitleDialogOpen(true);
  };

  const saveSelectedQuestions = async (status: 'verified' | 'pending') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Error", description: "Please login first", variant: "destructive" });
        return;
      }
      const toSave = questions.filter((_, idx) => selectedQuestions.includes(idx));
      if (toSave.length === 0) {
        toast({ title: "No questions selected", description: "Please select at least one question." });
        return;
      }
      const questionsToInsert = toSave.map(q => ({
        user_id: user.id,
        question_text: q.question_text,
        difficulty: "medium" as const,
        options: q.options ? q.options : null,
        correct_answer: q.correct_answer || null,
        answer_text: q.correct_answer || "",
        btl: q.btl,
        marks: q.marks,
        status,
        chapter: q.chapter || null,
        course_outcomes: q.course_outcomes || null,
        type: q.type,
      }));
      const { error } = await supabase.from("question_bank").insert(questionsToInsert);
      if (error) {
        console.error("Supabase insert error:", error);
        throw error;
      }
      toast({ title: "Success", description: `Questions saved as ${status}` });
      setSelectedQuestions([]);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to save questions", variant: "destructive" });
    }
  };

  const confirmSaveQuestions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Error", description: "Please login first", variant: "destructive" });
        return;
      }

      const questionsToInsert = questions.map(q => ({
        user_id: user.id,
        question_text: q.question_text,
        difficulty: "medium" as const,
        options: q.options ? q.options : null,
        correct_answer: q.correct_answer || null,
        answer_text: q.correct_answer || "",
        btl: q.btl,
        marks: q.marks,
        status: "pending" as const,
        chapter: q.chapter || null,
        course_outcomes: q.course_outcomes || null,
        type: q.type,
      }));

      const { error } = await supabase.from("question_bank").insert(questionsToInsert);

      if (error) {
        console.error("Supabase insert error:", error);
        throw error;
      }

      toast({ title: "Success", description: "Questions saved successfully" });
      setIsTitleDialogOpen(false);
      navigate("/verify");
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to save questions", variant: "destructive" });
    }
  };

  const addManualQuestion = () => {
    setQuestions([...questions, { ...manualQuestion }]);
    setManualQuestion({
      question_text: "",
      type: "objective",
      btl: 2,
      marks: 1,
      options: { A: "", B: "", C: "", D: "" },
      correct_answer: "",
      unit: "",
      topic: "",
      chapter: "",
      course_outcomes: "",
    });
    setIsManualEntry(false);
    toast({ title: "Question added", description: "Question added to the list" });
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  // Export units and their count as CSV
  const exportUnits = () => {
    // Count units
    const unitCount: Record<string, number> = {};
    questions.forEach(q => {
      if (q.unit) {
        unitCount[q.unit] = (unitCount[q.unit] || 0) + 1;
      }
    });
    // Prepare CSV
    let csv = "Unit,Count\n";
    Object.entries(unitCount).forEach(([unit, count]) => {
      csv += `${unit},${count}\n`;
    });
    // Download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `unit_counts.csv`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold text-primary">Upload Question Bank</h1>
          </div>
          {questions.length > 0 && (
            <div className="flex gap-2">
              <Button onClick={saveQuestions}>Save All Questions</Button>
              <Button variant="outline" onClick={exportUnits}>Export Unit Counts</Button>
            </div>
          )}
              {/* Title Dialog */}
              <Dialog open={isTitleDialogOpen} onOpenChange={setIsTitleDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Enter Title for Question Set</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Label>Title</Label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsTitleDialogOpen(false)}>Cancel</Button>
                    <Button onClick={confirmSaveQuestions}>Save All</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Upload Options</CardTitle>
              <CardDescription>Upload a CSV file or add questions manually</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <div>
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                    <Upload className="w-4 h-4" />
                    Upload CSV File
                  </div>
                </Label>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              <Button variant="outline" onClick={() => setIsManualEntry(!isManualEntry)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Question Manually
              </Button>
            </CardContent>
          </Card>

          {isManualEntry && (
            <Card>
              <CardHeader>
                <CardTitle>Add Question Manually</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Question Text</Label>
                  <Textarea
                    value={manualQuestion.question_text}
                    onChange={(e) => setManualQuestion({ ...manualQuestion, question_text: e.target.value })}
                    placeholder="Enter question text"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
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
                    <Label>BTL</Label>
                    <Select
                      value={manualQuestion.btl.toString()}
                      onValueChange={(value) => setManualQuestion({ ...manualQuestion, btl: parseInt(value) as BTLLevel })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Marks</Label>
                    <Input
                      type="number"
                      value={manualQuestion.marks}
                      onChange={(e) => setManualQuestion({ ...manualQuestion, marks: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>

                {(manualQuestion.type === "objective" || manualQuestion.type === "mcq") && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Option A</Label>
                      <Input
                        value={manualQuestion.options?.A || ""}
                        onChange={(e) => setManualQuestion({
                          ...manualQuestion,
                          options: { ...manualQuestion.options!, A: e.target.value }
                        })}
                      />
                    </div>
                    <div>
                      <Label>Option B</Label>
                      <Input
                        value={manualQuestion.options?.B || ""}
                        onChange={(e) => setManualQuestion({
                          ...manualQuestion,
                          options: { ...manualQuestion.options!, B: e.target.value }
                        })}
                      />
                    </div>
                    <div>
                      <Label>Option C</Label>
                      <Input
                        value={manualQuestion.options?.C || ""}
                        onChange={(e) => setManualQuestion({
                          ...manualQuestion,
                          options: { ...manualQuestion.options!, C: e.target.value }
                        })}
                      />
                    </div>
                    <div>
                      <Label>Option D</Label>
                      <Input
                        value={manualQuestion.options?.D || ""}
                        onChange={(e) => setManualQuestion({
                          ...manualQuestion,
                          options: { ...manualQuestion.options!, D: e.target.value }
                        })}
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

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Course Outcomes</Label>
                    <Input
                      value={manualQuestion.course_outcomes || ""}
                      onChange={(e) => setManualQuestion({ ...manualQuestion, course_outcomes: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Topic</Label>
                    <Input
                      value={manualQuestion.topic || ""}
                      onChange={(e) => setManualQuestion({ ...manualQuestion, topic: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Chapter</Label>
                    <Input
                      value={manualQuestion.chapter || ""}
                      onChange={(e) => setManualQuestion({ ...manualQuestion, chapter: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={addManualQuestion}>Add Question</Button>
                  <Button variant="outline" onClick={() => setIsManualEntry(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {questions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Questions ({questions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={selectedQuestions.length === questions.length && questions.length > 0}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedQuestions(questions.map((_, idx) => idx));
                      } else {
                        setSelectedQuestions([]);
                      }
                    }}
                    id="select-all"
                  />
                  <Label htmlFor="select-all" className="mr-4 cursor-pointer">Select All</Label>
                  <Button onClick={() => saveSelectedQuestions('verified')} variant="default">Save as Verified</Button>
                  <Button onClick={() => saveSelectedQuestions('pending')} variant="secondary">Save as Unverified</Button>
                  <Button onClick={() => {
                    setSelectedQuestions(questions.map((_, idx) => idx));
                    setTimeout(() => saveSelectedQuestions('verified'), 0);
                  }} variant="default">Save All as Verified</Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <TableHead>#</TableHead>
                        <TableHead>Question Text</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>BTL</TableHead>
                        <TableHead>Marks</TableHead>
                        <TableHead>Course Outcomes</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {questions.map((q, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedQuestions.includes(idx)}
                              onChange={() => handleSelectQuestion(idx)}
                            />
                          </TableCell>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell className="max-w-md truncate">{q.question_text}</TableCell>
                          <TableCell className="capitalize">{q.type}</TableCell>
                          <TableCell>{q.btl}</TableCell>
                          <TableCell>{q.marks}</TableCell>
                          <TableCell>{q.course_outcomes || "-"}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeQuestion(idx)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default UploadQuestions;
