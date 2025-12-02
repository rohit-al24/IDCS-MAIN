import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CheckCircle, Edit } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";


type Question = Tables<"question_bank">;

const VerifyQuestions = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [unverifiedQuestions, setUnverifiedQuestions] = useState<Question[]>([]);
  const [verifiedQuestions, setVerifiedQuestions] = useState<Question[]>([]);
  // Pagination state
  const [verifiedPage, setVerifiedPage] = useState(1);
  const [unverifiedPage, setUnverifiedPage] = useState(1);
  const PAGE_SIZE = 50;
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState<Partial<Question>>({});
  // For select all/individual selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // For select all/individual selection in unverified tab
  const [selectedUnverifiedIds, setSelectedUnverifiedIds] = useState<string[]>([]);
  const [imageSrcs, setImageSrcs] = useState<Record<string, string>>({});
  const [totalVerified, setTotalVerified] = useState(0);
  const [totalUnverified, setTotalUnverified] = useState(0);

  // Helpers for display: CO numbers and unified Type label
  const extractNumbers = (s?: string | null): string | null => {
    if (!s || typeof s !== "string") return null;
    const seen = new Set<string>();
    const out: string[] = [];
    const matches = s.match(/[1-5]/g);
    if (matches) {
      for (const d of matches) {
        if (!seen.has(d)) { seen.add(d); out.push(d); }
      }
    }
    return out.length ? out.join(",") : null;
  };

  const formatCourseOutcomes = (q: Question): string => {
    const anyQ = q as any;
    const nums: string | undefined = anyQ?.course_outcomes_numbers;
    if (typeof nums === "string" && nums.trim()) return nums;
    const fromCell = extractNumbers(anyQ?.course_outcomes_cell);
    if (fromCell) return fromCell;
    const fromCo = extractNumbers((anyQ?.course_outcomes as string) || "");
    if (fromCo) return fromCo;
    return "-";
  };

  const displayType = (q: Question): string => {
    const anyQ = q as any;
    if (anyQ?.excel_type === 'C') return 'Part C';
    if (q.type === 'descriptive' && /\bpart\s*c\b|\(c\)|\[c\]/i.test(q.question_text)) return 'Part C';
    return q.type as string;
  };

  useEffect(() => {
    fetchQuestions();
    // eslint-disable-next-line
  }, [verifiedPage, unverifiedPage]);

  // Build image object URLs for questions' image_url values.
  useEffect(() => {
    let mounted = true;
    const urls: Record<string, string> = {};
    const createdUrls: string[] = [];

    const pngSig = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
    const jpgSig = new Uint8Array([0xff,0xd8,0xff]);

    const findSignature = (buf: Uint8Array, sig: Uint8Array) => {
      for (let i = 0; i <= buf.length - sig.length; i++) {
        let ok = true;
        for (let j = 0; j < sig.length; j++) {
          if (buf[i + j] !== sig[j]) { ok = false; break; }
        }
        if (ok) return i;
      }
      return -1;
    };

    const processUrl = async (qId: string, url: string) => {
      try {
        if (!url) return;
        if (url.startsWith('data:')) {
          urls[qId] = url;
          return;
        }
        const res = await fetch(url);
        if (!res.ok) return;
        const contentType = res.headers.get('content-type') || '';
        const arrBuf = await res.arrayBuffer();
        const u8 = new Uint8Array(arrBuf);

        // If server returns correct image content-type, use it directly
        if (contentType.startsWith('image/')) {
          const blob = new Blob([u8], { type: contentType.split(';')[0] });
          const obj = URL.createObjectURL(blob);
          createdUrls.push(obj);
          urls[qId] = obj;
          return;
        }

        // Otherwise try to find PNG/JPEG signatures inside the bytes and slice
        let off = findSignature(u8, pngSig);
        let mime = 'image/png';
        if (off === -1) {
          off = findSignature(u8, jpgSig);
          mime = 'image/jpeg';
        }
        if (off >= 0) {
          const sliced = u8.slice(off);
          const blob = new Blob([sliced], { type: mime });
          const obj = URL.createObjectURL(blob);
          createdUrls.push(obj);
          urls[qId] = obj;
          return;
        }

        // Fallback: try to interpret as text and look for data:image base64 within
        const text = new TextDecoder().decode(u8);
        const m = text.match(/data:image\/(png|jpeg);base64,([A-Za-z0-9+\/=\n\r]+)/);
        if (m) {
          urls[qId] = `data:image/${m[1]};base64,${m[2].replace(/\s+/g, '')}`;
          return;
        }
      } catch (err) {
        // ignore per-image errors
      }
    };

    (async () => {
      const allQuestions = [...verifiedQuestions, ...unverifiedQuestions];
      const tasks: Promise<void>[] = [];
      for (const q of allQuestions) {
        if (!q?.image_url) continue;
        tasks.push(processUrl(q.id, q.image_url));
      }
      await Promise.all(tasks);
      if (mounted) setImageSrcs(urls);
    })();

    return () => {
      mounted = false;
      // revoke created object URLs
      createdUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    };
  }, [verifiedQuestions, unverifiedQuestions]);

  // Reverse: unverifiedQuestions = verified, verifiedQuestions = pending
  const fetchQuestions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch total counts for pagination
      const [{ count: verifiedCount }, { count: unverifiedCount }] = await Promise.all([
        supabase
          .from("question_bank")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "pending"),
        supabase
          .from("question_bank")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "verified"),
      ]);
      setTotalVerified(verifiedCount || 0);
      setTotalUnverified(unverifiedCount || 0);

      // Fetch only the current page for each
      const [{ data: unverified }, { data: verified }] = await Promise.all([
        supabase
          .from("question_bank")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "verified")
          .range((unverifiedPage - 1) * PAGE_SIZE, unverifiedPage * PAGE_SIZE - 1),
        supabase
          .from("question_bank")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .range((verifiedPage - 1) * PAGE_SIZE, verifiedPage * PAGE_SIZE - 1),
      ]);
      setUnverifiedQuestions(unverified || []);
      setVerifiedQuestions(verified || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to fetch questions", variant: "destructive" });
    }
  };

  const openEditDialog = (question: Question) => {
    setSelectedQuestion(question);
    setEditedQuestion(question);
    setIsEditDialogOpen(true);
  };

  // Set status to 'pending' (move to unverified)
  const markPending = async () => {
    if (!selectedQuestion) return;
    try {
      const { error } = await supabase
        .from("question_bank")
        .update({
          ...editedQuestion,
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedQuestion.id);
      if (error) throw error;
      toast({ title: "Success", description: "Question marked as unverified" });
      setIsEditDialogOpen(false);
      fetchQuestions();
    } catch (error) {
      toast({ title: "Error", description: "Failed to mark as unverified", variant: "destructive" });
    }
  };

  // Set status to 'verified' (move to verified)
  const markVerified = async () => {
    if (!selectedQuestion) return;
    try {
      const { error } = await supabase
        .from("question_bank")
        .update({
          ...editedQuestion,
          status: "verified",
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedQuestion.id);
      if (error) throw error;
      toast({ title: "Success", description: "Question marked as verified" });
      setIsEditDialogOpen(false);
      fetchQuestions();
    } catch (error) {
      toast({ title: "Error", description: "Failed to mark as verified", variant: "destructive" });
    }
  };

  // Pagination helpers
  const getPage = (arr: Question[]) => arr;
  const totalVerifiedPages = Math.ceil(totalVerified / PAGE_SIZE) || 1;
  const totalUnverifiedPages = Math.ceil(totalUnverified / PAGE_SIZE) || 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-primary">Question Verification</h1>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="verified" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="verified">
              Unverified ({totalVerified})
            </TabsTrigger>
            <TabsTrigger value="unverified">
              Verified ({totalUnverified})
            </TabsTrigger>
          </TabsList>

          {/* Unverified tab now shows status 'pending' questions, can mark as unverified (move to verified list) */}
          <TabsContent value="verified">
            <Card>
              <CardHeader>
                <CardTitle>Unverified Questions (Actually Pending)</CardTitle>
              </CardHeader>
              <CardContent>
                {verifiedQuestions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No pending questions yet</p>
                ) : (
                  <>
                    <div className="mb-4 flex gap-2 items-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === getPage(verifiedQuestions).length && getPage(verifiedQuestions).length > 0}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedIds(getPage(verifiedQuestions).map(q => q.id));
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                        id="select-all-checkbox"
                        className="mr-2"
                      />
                      <label htmlFor="select-all-checkbox" className="text-sm select-none cursor-pointer">Select All</label>
                      <Button
                        onClick={async () => {
                          try {
                            const ids = selectedIds;
                            if (ids.length === 0) return;
                            const { error } = await supabase
                              .from("question_bank")
                              .update({ status: "verified", updated_at: new Date().toISOString() })
                              .in("id", ids);
                            if (error) throw error;
                            toast({ title: "Success", description: "Selected questions marked as verified" });
                            setSelectedIds([]);
                            fetchQuestions();
                          } catch (error) {
                            toast({ title: "Error", description: "Failed to mark selected as verified", variant: "destructive" });
                          }
                        }}
                        disabled={selectedIds.length === 0}
                      >Verify Selected</Button>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{/* Checkbox column */}</TableHead>
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
                          {getPage(verifiedQuestions).map((q, idx) => (
                            <TableRow key={q.id}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selectedIds.includes(q.id)}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setSelectedIds(prev => [...prev, q.id]);
                                    } else {
                                      setSelectedIds(prev => prev.filter(id => id !== q.id));
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell>{(verifiedPage - 1) * PAGE_SIZE + idx + 1}</TableCell>
                              <TableCell className="max-w-md">
                                <div className="flex flex-col gap-2">
                                  <div className="truncate">{q.question_text}</div>
                                  {(imageSrcs[q.id] || q.image_url) ? (
                                    <img src={imageSrcs[q.id] || q.image_url} alt="Question" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 4 }} />
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="capitalize">{displayType(q)}</TableCell>
                              <TableCell>{q['btl'] ?? '-'}</TableCell>
                              <TableCell>{q.marks ?? '-'}</TableCell>
                              <TableCell>{formatCourseOutcomes(q)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setSelectedQuestion(q); setEditedQuestion(q); setIsEditDialogOpen(true); }}
                                >
                                  <Edit className="w-4 h-4" />
                                  Verify
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {/* Pagination controls */}
                    <div className="flex justify-center items-center gap-2 mt-4">
                      <Button variant="outline" size="sm" onClick={() => setVerifiedPage(p => Math.max(1, p - 1))} disabled={verifiedPage === 1}>Prev</Button>
                      <span>Page {verifiedPage} of {totalVerifiedPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setVerifiedPage(p => Math.min(totalVerifiedPages, p + 1))} disabled={verifiedPage === totalVerifiedPages}>Next</Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Verified tab now shows status 'verified' questions, can mark as unverified */}
          <TabsContent value="unverified">
            <Card>
              <CardHeader>
                <CardTitle>Verified Questions (Actually Verified)</CardTitle>
              </CardHeader>
              <CardContent>
                {unverifiedQuestions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No verified questions</p>
                ) : (
                  <>
                    <div className="mb-4 flex gap-2 items-center">
                      <input
                        type="checkbox"
                        checked={selectedUnverifiedIds.length === getPage(unverifiedQuestions).length && getPage(unverifiedQuestions).length > 0}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedUnverifiedIds(getPage(unverifiedQuestions).map(q => q.id));
                          } else {
                            setSelectedUnverifiedIds([]);
                          }
                        }}
                        id="select-all-unverified-checkbox"
                        className="mr-2"
                      />
                      <label htmlFor="select-all-unverified-checkbox" className="text-sm select-none cursor-pointer">Select All</label>
                      <Button
                        onClick={async () => {
                          try {
                            const ids = selectedUnverifiedIds;
                            if (ids.length === 0) return;
                            const { error } = await supabase
                              .from("question_bank")
                              .update({ status: "pending", updated_at: new Date().toISOString() })
                              .in("id", ids);
                            if (error) throw error;
                            toast({ title: "Success", description: "Selected questions marked as unverified" });
                            setSelectedUnverifiedIds([]);
                            fetchQuestions();
                          } catch (error) {
                            toast({ title: "Error", description: "Failed to mark selected as unverified", variant: "destructive" });
                          }
                        }}
                        disabled={selectedUnverifiedIds.length === 0}
                      >Mark Selected Unverified</Button>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead></TableHead>
                            <TableHead>#</TableHead>
                            <TableHead>Image</TableHead>
                            <TableHead>Question Text</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>BTL</TableHead>
                            <TableHead>Marks</TableHead>
                            <TableHead>Course Outcomes</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getPage(unverifiedQuestions).map((q, idx) => (
                            <TableRow key={q.id}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selectedUnverifiedIds.includes(q.id)}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setSelectedUnverifiedIds(prev => [...prev, q.id]);
                                    } else {
                                      setSelectedUnverifiedIds(prev => prev.filter(id => id !== q.id));
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell>{(unverifiedPage - 1) * PAGE_SIZE + idx + 1}</TableCell>
                              <TableCell>
                                {(imageSrcs[q.id] || q.image_url) ? (
                                  (imageSrcs[q.id] || q.image_url).startsWith("data:") ? (
                                    <img src={imageSrcs[q.id] || q.image_url} alt="Question" style={{ maxWidth: 60, maxHeight: 60, borderRadius: 4 }} />
                                  ) : (
                                    <a href={imageSrcs[q.id] || q.image_url} target="_blank" rel="noopener noreferrer">
                                      <img src={imageSrcs[q.id] || q.image_url} alt="Question" style={{ maxWidth: 60, maxHeight: 60, borderRadius: 4 }} />
                                    </a>
                                  )
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="max-w-md">
                                <div className="flex flex-col gap-2">
                                  <div className="truncate">{q.question_text}</div>
                                  {(imageSrcs[q.id] || q.image_url) ? (
                                    <img src={imageSrcs[q.id] || q.image_url} alt="Question" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 4 }} />
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="capitalize">{displayType(q)}</TableCell>
                              <TableCell>{q['btl'] ?? '-'}</TableCell>
                              <TableCell>{q.marks ?? '-'}</TableCell>
                              <TableCell>{formatCourseOutcomes(q)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditDialog(q)}
                                >
                                  <CheckCircle className="w-4 h-4 mr-2 text-primary" />
                                  Mark Unverified
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {/* Pagination controls */}
                    <div className="flex justify-center items-center gap-2 mt-4">
                      <Button variant="outline" size="sm" onClick={() => setUnverifiedPage(p => Math.max(1, p - 1))} disabled={unverifiedPage === 1}>Prev</Button>
                      <span>Page {unverifiedPage} of {totalUnverifiedPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setUnverifiedPage(p => Math.min(totalUnverifiedPages, p + 1))} disabled={unverifiedPage === totalUnverifiedPages}>Next</Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit & Change Status</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Question Text</Label>
              <Textarea
                value={editedQuestion.question_text || ""}
                onChange={(e) => setEditedQuestion({ ...editedQuestion, question_text: e.target.value })}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Type</Label>
                <Select
                  value={editedQuestion.type || ""}
                  onValueChange={(value) => setEditedQuestion({ ...editedQuestion, type: value as any })}
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
                <Label>Difficulty</Label>
                <Select
                  value={editedQuestion.difficulty || ""}
                  onValueChange={(value) => setEditedQuestion({ ...editedQuestion, difficulty: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Marks</Label>
                <Input
                  type="number"
                  value={editedQuestion.marks || 1}
                  onChange={(e) => setEditedQuestion({ ...editedQuestion, marks: parseInt(e.target.value) })}
                />
              </div>
            </div>

            {(editedQuestion.type === "objective" || editedQuestion.type === "mcq") && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Option A</Label>
                    <Input
                      value={(editedQuestion.options as any)?.A || ""}
                      onChange={(e) => setEditedQuestion({
                        ...editedQuestion,
                        options: { ...(editedQuestion.options as any), A: e.target.value }
                      })}
                    />
                  </div>
                  <div>
                    <Label>Option B</Label>
                    <Input
                      value={(editedQuestion.options as any)?.B || ""}
                      onChange={(e) => setEditedQuestion({
                        ...editedQuestion,
                        options: { ...(editedQuestion.options as any), B: e.target.value }
                      })}
                    />
                  </div>
                  <div>
                    <Label>Option C</Label>
                    <Input
                      value={(editedQuestion.options as any)?.C || ""}
                      onChange={(e) => setEditedQuestion({
                        ...editedQuestion,
                        options: { ...(editedQuestion.options as any), C: e.target.value }
                      })}
                    />
                  </div>
                  <div>
                    <Label>Option D</Label>
                    <Input
                      value={(editedQuestion.options as any)?.D || ""}
                      onChange={(e) => setEditedQuestion({
                        ...editedQuestion,
                        options: { ...(editedQuestion.options as any), D: e.target.value }
                      })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Correct Answer</Label>
                  <Select
                    value={editedQuestion.correct_answer || ""}
                    onValueChange={(value) => setEditedQuestion({ ...editedQuestion, correct_answer: value })}
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
              </>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Unit</Label>
                <Input
                  value={editedQuestion.unit || ""}
                  onChange={(e) => setEditedQuestion({ ...editedQuestion, unit: e.target.value })}
                />
              </div>
              <div>
                <Label>Topic</Label>
                <Input
                  value={editedQuestion.topic || ""}
                  onChange={(e) => setEditedQuestion({ ...editedQuestion, topic: e.target.value })}
                />
              </div>
              <div>
                <Label>Chapter</Label>
                <Input
                  value={editedQuestion.chapter || ""}
                  onChange={(e) => setEditedQuestion({ ...editedQuestion, chapter: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            {/* Show button depending on which tab/question status */}
            {selectedQuestion?.status === "verified" ? (
              <Button onClick={markPending}>Mark Unverified</Button>
            ) : (
              <Button onClick={markVerified}>Mark Verified</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VerifyQuestions;
