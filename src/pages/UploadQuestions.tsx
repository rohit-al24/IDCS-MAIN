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
import { ArrowLeft, Upload, Plus, Trash2 } from "lucide-react";
import { AnimatedRingLoader } from "@/components/ui/AnimatedRingLoader";
import { Textarea } from "@/components/ui/textarea";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";

type QuestionType = "objective" | "mcq" | "descriptive";
// Support BTL levels up to 6 (extend if needed)
type BTLLevel = 1 | 2 | 3 | 4 | 5 | 6;

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
  image?: string | null;
  // debug fields returned from backend
  image_present?: boolean | null;
  image_anchor_row?: number | null;
  image_anchor_col?: number | null;
  image_mapped_row?: number | null;
}

const UploadQuestions = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveDone, setSaveDone] = useState(false);
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

    setIsUploading(true);
    setUploadDone(false);

    // Upload file to backend for parsing (to get images too)
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload-questions-excel/", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        toast({ title: "Error", description: `Backend error: ${res.statusText}` });
        setIsUploading(false);
        return;
      }
      const result = await res.json();
      if (result.questions && Array.isArray(result.questions)) {
        setQuestions(result.questions);
        toast({ title: "File uploaded", description: `${result.questions.length} questions parsed from Excel` });
        setUploadDone(true);
      } else {
        toast({ title: "Error", description: "No questions found in file." });
      }
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to upload or parse file", variant: "destructive" });
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadDone(false), 2000); // Reset after showing check
    }
  };

  // No backend URL logic needed; use Supabase or client-side only
  // Remove handleFileUploadBackend and resolveBackendBase

  const handleSelectQuestion = (idx: number) => {
    setSelectedQuestions((prev) =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const saveQuestions = async () => {
    setIsTitleDialogOpen(true);
  };

  const saveSelectedQuestions = async (status: 'verified' | 'pending') => {
    setIsSaving(true);
    setSaveDone(false);
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
      // upload images to Supabase Storage and get image_url for each question (if present)
      const bucket = 'question-images';
      const uploadImage = async (dataUrl: string, key: string) => {
        try {
          console.log('[uploadImage] Using bucket:', bucket, 'key:', key);
          if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
            console.warn('[uploadImage] Not a valid image data URL:', dataUrl?.slice(0, 100));
            return null;
          }
          // Log the prefix and first 100 chars for debug
          console.log('[uploadImage] dataUrl prefix:', dataUrl.slice(0, 30));
          const arr = dataUrl.split(',');
          if (arr.length < 2) {
            console.warn('[uploadImage] Malformed dataUrl:', dataUrl.slice(0, 100));
            return null;
          }
          const mimeMatch = arr[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : 'image/png';
          const bstr = atob(arr[1]);
          // Detect and remove multipart boundary preamble accidentally embedded
          // Look for PNG or JPEG signature and discard any preceding text noise.
          const findSignatureOffset = (): number => {
            const sigPNG = '\\x89PNG\\r\\n\\x1A\\n';
            const sigJPEG = '\\xFF\\xD8\\xFF';
            const idxPNG = bstr.indexOf(sigPNG);
            const idxJPEG = bstr.indexOf(sigJPEG);
            let best = -1;
            if (idxPNG >= 0) best = idxPNG;
            if (idxJPEG >= 0 && (best === -1 || idxJPEG < best)) best = idxJPEG;
            return best;
          };
          let cleanBstr = bstr;
          if (/WebKitFormBoundary/.test(bstr)) {
            const off = findSignatureOffset();
            if (off > 0) {
              console.warn('[uploadImage] Stripping multipart boundary, signature at', off);
              cleanBstr = bstr.slice(off);
            } else {
              console.warn('[uploadImage] Boundary detected but no signature found; using original bytes');
            }
          }
          let n = bstr.length;
          const u8arr = new Uint8Array(cleanBstr.length);
          for (let i = 0; i < cleanBstr.length; i++) {
            u8arr[i] = cleanBstr.charCodeAt(i);
          }
          const file = new File([u8arr], key, { type: mime });
          const path = `${key}`;
          const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
          if (upErr) {
            console.error('Storage upload error', upErr);
            return null;
          }
          const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
          console.log('[uploadImage] publicData:', publicData);
          return publicData?.publicUrl || null;
        } catch (err) {
          console.error('uploadImage failed', err);
          return null;
        }
      };

      // prepare insert array with image_url resolved
      const questionsToInsert = [] as any[];
      for (let i = 0; i < toSave.length; i++) {
        const q = toSave[i];
        let image_url = null;
        if (q.image) {
          // create a predictable key: title + index + timestamp
          const key = `${(title || 'uploads').replace(/[^a-z0-9-_]/gi, '_')}/${Date.now()}_${i}.png`;
          image_url = await uploadImage(q.image, key);
        }
        questionsToInsert.push({
          user_id: user.id,
          question_text: q.question_text,
          type: q.type,
          options: q.options || null,
          correct_answer: q.correct_answer || null,
          answer_text: q.correct_answer || '',
          btl: q.btl,
          marks: q.marks,
          status: status as 'verified' | 'pending' | 'rejected',
          chapter: q.chapter || null,
          course_outcomes: q.course_outcomes || null,
          title: title || null,
          image_url,
        });
      }
      const { error } = await supabase.from("question_bank").insert(questionsToInsert);
      if (error) {
        console.error("Supabase insert error:", error);
        throw error;
      }
      toast({ title: "Success", description: `Saved ${questionsToInsert.length} questions` });
      setSelectedQuestions([]);
      setSaveDone(true);
      setTimeout(() => setSaveDone(false), 2000);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to save questions", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmSaveQuestions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Error", description: "Please login first", variant: "destructive" });
        return;
      }
      if (questions.length === 0) {
        toast({ title: 'No questions', description: 'Nothing to save.' });
        return;
      }
      // upload images and prepare insert rows
      const bucket = 'question-images';
      const uploadImage = async (dataUrl: string, key: string) => {
        try {
          console.log('[uploadImage][confirmSave] Using bucket:', bucket, 'key:', key);
          if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
            console.warn('[uploadImage][confirmSave] Not a valid image data URL:', dataUrl?.slice(0, 100));
            return null;
          }
          const arr = dataUrl.split(',');
          if (arr.length < 2) {
            console.warn('[uploadImage][confirmSave] Malformed dataUrl:', dataUrl.slice(0, 80));
            return null;
          }
          const mimeMatch = arr[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : 'image/png';
          const bstr = atob(arr[1]);
          const findSignatureOffset = (): number => {
            const sigPNG = '\\x89PNG\\r\\n\\x1A\\n';
            const sigJPEG = '\\xFF\\xD8\\xFF';
            const idxPNG = bstr.indexOf(sigPNG);
            const idxJPEG = bstr.indexOf(sigJPEG);
            let best = -1;
            if (idxPNG >= 0) best = idxPNG;
            if (idxJPEG >= 0 && (best === -1 || idxJPEG < best)) best = idxJPEG;
            return best;
          };
          let cleanBstr = bstr;
          if (/WebKitFormBoundary/.test(bstr)) {
            const off = findSignatureOffset();
            if (off > 0) {
              console.warn('[uploadImage][confirmSave] Stripping multipart boundary, signature at', off);
              cleanBstr = bstr.slice(off);
            } else {
              console.warn('[uploadImage][confirmSave] Boundary detected but no signature found; using original bytes');
            }
          }
          const u8arr = new Uint8Array(cleanBstr.length);
          for (let i = 0; i < cleanBstr.length; i++) {
            u8arr[i] = cleanBstr.charCodeAt(i);
          }
          const file = new File([u8arr], key, { type: mime });
          const path = `${key}`;
          const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
          if (upErr) {
            console.error('Storage upload error', upErr);
            return null;
          }
          const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
          console.log('[uploadImage][confirmSave] publicData:', publicData);
          return publicData?.publicUrl || null;
        } catch (err) {
          console.error('uploadImage failed', err);
          return null;
        }
      };

      const questionsToInsert: any[] = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        let image_url = null;
        if (q.image) {
          const key = `${(title || 'uploads').replace(/[^a-z0-9-_]/gi, '_')}/${Date.now()}_${i}.png`;
          image_url = await uploadImage(q.image, key);
        }
        questionsToInsert.push({
          user_id: user.id,
          question_text: q.question_text,
          type: q.type,
          options: q.options || null,
          correct_answer: q.correct_answer || null,
          answer_text: q.correct_answer || '',
          btl: q.btl,
          marks: q.marks,
          status: 'pending' as 'pending',
          chapter: q.chapter || null,
          course_outcomes: q.course_outcomes || null,
          title: title || null,
          image_url,
        });
      }
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
    if (!manualQuestion.course_outcomes || !/^CO[1-5]$/i.test(manualQuestion.course_outcomes.trim())) {
      toast({
        title: "Course Outcomes Required",
        description: "Please enter Course Outcomes as CO1, CO2, CO3, CO4, or CO5.",
        variant: "destructive"
      });
      return;
    }
    setQuestions([...questions, { ...manualQuestion, course_outcomes: manualQuestion.course_outcomes.trim().toUpperCase() }]);
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
        {(isSaving || saveDone) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <AnimatedRingLoader done={saveDone} />
          </div>
        )}
        <div className="grid gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Upload Options</CardTitle>
              <CardDescription>Upload a CSV file or add questions manually</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4 items-center min-h-[120px]">
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
              <div className="flex-1 flex justify-center">
                {(isUploading || uploadDone) && <AnimatedRingLoader done={uploadDone} />}
              </div>
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
                        <SelectItem value="4">4</SelectItem>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="6">6</SelectItem>
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
                        <TableHead>Image</TableHead>
                        <TableHead>Anchor</TableHead>
                        <TableHead>Mapped</TableHead>
                        <TableHead>Img?</TableHead>
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
                          <TableCell>
                            {q.image ? (
                              <img src={q.image} alt="Question" style={{ maxWidth: 80, maxHeight: 80, borderRadius: 4 }} />
                            ) : (
                              <span style={{ color: '#aaa' }}>No image</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {q.image_anchor_row ? `${q.image_anchor_row},${q.image_anchor_col || ''}` : '-'}
                          </TableCell>
                          <TableCell>
                            {q.image_mapped_row ? `${q.image_mapped_row}` : '-'}
                          </TableCell>
                          <TableCell>
                            {q.image_present ? <span style={{ color: 'green' }}>Yes</span> : <span style={{ color: '#aaa' }}>No</span>}
                          </TableCell>
                          <TableCell className="capitalize">{q.type}</TableCell>
                          <TableCell>{q.btl}</TableCell>
                          <TableCell>{q.marks}</TableCell>
                          <TableCell style={{ color: !q.course_outcomes ? 'red' : undefined, fontWeight: !q.course_outcomes ? 'bold' : undefined }}>
                            {q.course_outcomes || "(Missing)"}
                          </TableCell>
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
                {/* CO/type summary */}
                <div className="mt-6">
                  <h4 className="font-semibold mb-2">CO/Type Summary</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-max text-sm border border-gray-200">
                      <thead>
                        <tr>
                          <th className="border px-2 py-1">CO</th>
                          <th className="border px-2 py-1">Objective</th>
                          <th className="border px-2 py-1">Descriptive</th>
                        </tr>
                      </thead>
                      <tbody>
                        {["CO1", "CO2", "CO3", "CO4", "CO5"].map(co => {
                          const objCount = questions.filter(q => q.course_outcomes === co && q.type === "objective").length;
                          const descCount = questions.filter(q => q.course_outcomes === co && q.type === "descriptive").length;
                          return (
                            <tr key={co}>
                              <td className="border px-2 py-1 font-semibold">{co}</td>
                              <td className="border px-2 py-1" style={{ color: objCount === 0 ? 'red' : undefined, fontWeight: objCount === 0 ? 'bold' : undefined }}>{objCount}</td>
                              <td className="border px-2 py-1" style={{ color: descCount === 0 ? 'red' : undefined, fontWeight: descCount === 0 ? 'bold' : undefined }}>{descCount}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
