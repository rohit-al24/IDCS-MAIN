import { useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";



// Editable row component for a question (single, correct definition)

// Editable row component for a question
function EditableQuestionRow({ question, onSave }) {
  const [edit, setEdit] = React.useState({
    question_text: question.question_text || "",
    course_outcomes: question.course_outcomes || "",
    btl: question.btl || "",
    marks: question.marks || "",
  });
  const [saving, setSaving] = React.useState(false);
  const changed =
    edit.question_text !== (question.question_text || "") ||
    edit.course_outcomes !== (question.course_outcomes || "") ||
    edit.btl !== (question.btl || "") ||
    edit.marks !== (question.marks || "");
  return (
    <div className="border rounded-lg p-4 bg-muted/50">
      <div className="mb-2">
        <label className="block text-xs font-medium mb-1">Question Text</label>
        <Input
          value={edit.question_text}
          onChange={e => setEdit(v => ({ ...v, question_text: e.target.value }))}
          className="w-full"
        />
      </div>
      <div className="flex gap-4 mb-2">
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1">CO</label>
          <Input
            value={edit.course_outcomes}
            onChange={e => setEdit(v => ({ ...v, course_outcomes: e.target.value }))}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1">BTL</label>
          <Input
            value={edit.btl}
            onChange={e => setEdit(v => ({ ...v, btl: e.target.value }))}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1">Marks</label>
          <Input
            type="number"
            value={edit.marks}
            onChange={e => setEdit(v => ({ ...v, marks: e.target.value }))}
          />
        </div>
      </div>
      <Button
        variant="default"
        size="sm"
        disabled={saving || !changed}
        onClick={async () => {
          setSaving(true);
          const numsMatch = String(edit.course_outcomes || '').match(/\d+/g) || [];
          const coNums = numsMatch.length ? Array.from(new Set(numsMatch)).join(',') : null;
          await onSave({ ...edit, course_outcomes_numbers: coNums });
          setSaving(false);
        }}
      >{saving ? "Saving..." : "Save"}</Button>
    </div>
  );
}
import { supabase } from "@/integrations/supabase/client";

// Image preview hook (same logic as Verify/GeneratePaper)
type ImageSrcs = Record<string, string>;
function useQuestionImages(questions: any[]): ImageSrcs {
  const [imageSrcs, setImageSrcs] = useState<ImageSrcs>({});
  const createdUrls = useRef<string[]>([]);

  useEffect(() => {
    let mounted = true;
    const urls: ImageSrcs = {};
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
        if (url.startsWith('data:')) { urls[qId] = url; return; }
        const res = await fetch(url);
        if (!res.ok) return;
        const contentType = res.headers.get('content-type') || '';
        const arrBuf = await res.arrayBuffer();
        const u8 = new Uint8Array(arrBuf);
        if (contentType.startsWith('image/')) {
          const blob = new Blob([u8], { type: contentType.split(';')[0] });
          const obj = URL.createObjectURL(blob);
          createdUrls.current.push(obj);
          urls[qId] = obj;
          return;
        }
        let off = findSignature(u8, pngSig);
        let mime = 'image/png';
        if (off === -1) { off = findSignature(u8, jpgSig); mime = 'image/jpeg'; }
        if (off >= 0) {
          const sliced = u8.slice(off);
          const blob = new Blob([sliced], { type: mime });
          const obj = URL.createObjectURL(blob);
          createdUrls.current.push(obj);
          urls[qId] = obj;
          return;
        }
        const text = new TextDecoder().decode(u8);
        const m = text.match(/data:image\/(png|jpeg);base64,([A-Za-z0-9+\/\=\n\r]+)/);
        if (m) {
          urls[qId] = `data:image/${m[1]};base64,${m[2].replace(/\s+/g, '')}`;
          return;
        }
      } catch (err) {}
    };
    (async () => {
      const tasks: Promise<void>[] = [];
      for (const q of questions) {
        if (!q?.image_url) continue;
        tasks.push(processUrl(q.id, q.image_url));
      }
      await Promise.all(tasks);
      if (mounted) setImageSrcs(urls);
    })();
    return () => {
      mounted = false;
      createdUrls.current.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    };
  }, [questions]);
  return imageSrcs;
}

const ManageQuestionsPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<any>(null);
  const [banks, setBanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const imageSrcs = useQuestionImages(questions);

  // Edit single question modal
  const [editingQ, setEditingQ] = useState(null);
  // Edit Qns Modal
  const [editQnsOpen, setEditQnsOpen] = useState(false);
  // Delete Bank
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Pagination state for questions
  const [questionsPage, setQuestionsPage] = useState(1);
  const QUESTIONS_PAGE_SIZE = 50;
  const [totalQuestions, setTotalQuestions] = useState(0);

  const totalQuestionsPages = Math.max(1, Math.ceil(totalQuestions / QUESTIONS_PAGE_SIZE));

  useEffect(() => {
    const fetchBanks = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setBanks([]);
          setLoading(false);
          return;
        }
        // Get distinct title_ids from question_bank that belong to this user and are verified
        const { data: idRows, error: idErr } = await supabase
          .from("question_bank")
          .select("title_id")
          .eq("user_id", user.id)
          .eq("status", "verified");
        if (idErr) {
          setErrorMsg(idErr.message);
          setBanks([]);
          setLoading(false);
          return;
        }
        const ids = Array.from(new Set((idRows || []).map((r: any) => r.title_id).filter(Boolean)));
        if (ids.length === 0) {
          setBanks([]);
          setLoading(false);
          return;
        }
        // Fetch titles from question_bank_titles for these ids
        const { data, error } = await supabase
          .from("question_bank_titles")
          .select("id, title")
          .in("id", ids);
        if (error) {
          setErrorMsg(error.message);
          setBanks([]);
          setLoading(false);
          return;
        }
        setBanks((data || []).map((r: any) => ({ id: r.id, title: (r.title || "").trim() })));
      } catch (e: any) {
        setErrorMsg(e.message || String(e));
        setBanks([]);
      }
      setLoading(false);
    };
    fetchBanks();
  }, []);

  const filteredBanks = banks.filter((bank) =>
    (bank.title || "").toLowerCase().includes(search.toLowerCase())
  );

  // Fetch questions for selected bank
  useEffect(() => {
    const fetchQuestions = async () => {
      if (!selectedBank) return;
      setQuestionsLoading(true);
      setQuestions([]);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setQuestions([]); setQuestionsLoading(false); return; }
        // Get total count using title_id
        const { count } = await supabase
          .from("question_bank")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "verified")
          .eq("title_id", selectedBank.id);
        setTotalQuestions(count || 0);
        // Fetch only the current page
        const { data, error } = await supabase
          .from("question_bank")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "verified")
          .eq("title_id", selectedBank.id)
          .range((questionsPage - 1) * QUESTIONS_PAGE_SIZE, questionsPage * QUESTIONS_PAGE_SIZE - 1);
        if (error) { setQuestions([]); setQuestionsLoading(false); return; }
        setQuestions(data || []);
      } catch {
        setQuestions([]);
      }
      setQuestionsLoading(false);
    };
    fetchQuestions();
  }, [selectedBank, questionsPage]);

  // Helper to render CO as comma-separated numbers
  const formatCourseOutcomes = (q: any): string => {
    const nums = String(q?.course_outcomes_numbers || '').trim();
    if (nums) return nums;
    const cell = String(q?.course_outcomes_cell || '').trim();
    const m1 = cell.match(/[1-5]/g);
    if (m1 && m1.length) return Array.from(new Set(m1)).join(',');
    const co = String(q?.course_outcomes || '').trim();
    const m2 = co.match(/[1-5]/g);
    if (m2 && m2.length) return Array.from(new Set(m2)).join(',');
    return co || '-';
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4 text-primary">Manage Questions</h1>
      <div className="mb-6 flex items-center gap-4">
        <Input
          placeholder="Search question banks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-96 text-lg"
        />
        <Button variant="secondary">Add New Bank</Button>
      </div>
      {loading ? (
        <div className="text-center text-muted-foreground py-12">Loading...</div>
      ) : errorMsg ? (
        <div className="text-center text-red-500 py-12">{errorMsg}</div>
      ) : !selectedBank ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredBanks.map(bank => (
            <Card
              key={bank.title}
              className="cursor-pointer transition-all duration-200 border border-primary/10 bg-primary/5 dark:bg-background/80 hover:border-primary/60 hover:shadow-xl group"
              style={{ minHeight: 80, display: 'flex', alignItems: 'center' }}
              onClick={() => setSelectedBank(bank)}
            >
              <CardContent className="p-6 flex items-center">
                <div className="text-xl font-semibold text-primary group-hover:text-primary/90 mb-0 truncate" style={{ wordBreak: 'break-word' }}>{bank.title}</div>
              </CardContent>
            </Card>
          ))}
          {filteredBanks.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground">No question banks found.</div>
          )}
        </div>
      ) : (
        <div>
          {/* Top Bar with Bank Name and Actions */}
          <div className="flex items-center justify-between bg-primary/10 rounded-t-xl px-6 py-4 mb-2">
            <div>
              <div className="text-2xl font-bold text-primary">{selectedBank.title}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditQnsOpen(true)}>Edit Questions</Button>
              <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>Delete Bank</Button>
              <Button variant="ghost" onClick={() => setSelectedBank(null)}>Back</Button>
            </div>
          </div>


                    {/* Edit Questions Dialog (editable fields) */}
                    <Dialog open={editQnsOpen} onOpenChange={setEditQnsOpen}>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Edit Questions</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                          {questions.map((q, idx) => (
                            <EditableQuestionRow
                              key={q.id}
                              question={q}
                              onSave={async (updated) => {
                                // Update in DB
                                const { data: { user } } = await supabase.auth.getUser();
                                if (!user) return;
                                const numsMatch = String(updated.course_outcomes || '').match(/\d+/g) || [];
                                const coNums = numsMatch.length ? Array.from(new Set(numsMatch)).join(',') : null;
                                await supabase
                                  .from("question_bank")
                                  .update({
                                    question_text: updated.question_text,
                                    course_outcomes: updated.course_outcomes,
                                    btl: updated.btl,
                                    marks: updated.marks,
                                    course_outcomes_numbers: coNums,
                                  })
                                  .eq("id", q.id)
                                  .eq("user_id", user.id);
                                // Update in local state
                                setQuestions((prev) => prev.map((qq, i) => i === idx ? { ...qq, ...updated, course_outcomes_numbers: coNums } : qq));
                              }}
                            />
                          ))}
                          {questions.length === 0 && <div className="text-center text-muted-foreground">No questions in this bank.</div>}
                        </div>
                        <DialogFooter>
                          <Button variant="secondary" onClick={() => setEditQnsOpen(false)}>Close</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>


          // Editable row component for a question
          import React from "react";

                    {/* Delete Bank Dialog */}
                    <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete Question Bank</DialogTitle>
                        </DialogHeader>
                        <div className="mb-4">Are you sure you want to delete <span className="font-bold">{selectedBank.title}</span> and all its questions? This cannot be undone.</div>
                        <DialogFooter>
                          <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                          <Button
                            variant="destructive"
                            disabled={deleteLoading}
                            onClick={async () => {
                              setDeleteLoading(true);
                              try {
                                const { data: { user } } = await supabase.auth.getUser();
                                if (!user) throw new Error("Not logged in");
                                await supabase
                                  .from("question_bank")
                                  .delete()
                                  .eq("user_id", user.id)
                                  .eq("title_id", selectedBank.id);
                                setDeleteConfirmOpen(false);
                                setSelectedBank(null);
                                // Refresh banks
                                setBanks(banks.filter(b => b.title !== selectedBank.title));
                              } catch (e) {}
                              setDeleteLoading(false);
                            }}
                          >{deleteLoading ? "Deleting..." : "Delete"}</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
          {/* Questions Grid with Edit button */}
          <div className="bg-card rounded-b-xl p-6 shadow-md">
            {questionsLoading ? (
              <div className="text-center text-muted-foreground">Loading questions...</div>
            ) : questions.length === 0 ? (
              <div className="text-center text-muted-foreground">No questions found in this bank.</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-2">Question</th>
                    <th className="text-left p-2">Marks</th>
                    <th className="text-left p-2">BTL</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">CO</th>
                    <th className="text-left p-2">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map(q => (
                    <tr key={q.id} className="border-b">
                      <td className="p-2">
                        <div>{q.question_text}</div>
                        {(imageSrcs[q.id] || q.image_url) && (
                          <img
                            src={imageSrcs[q.id] || q.image_url}
                            alt="Question"
                            className="mt-2"
                            style={{ maxWidth: 160, maxHeight: 160, borderRadius: 4 }}
                          />
                        )}
                      </td>
                      <td className="p-2">{q.marks}</td>
                      <td className="p-2">{q.btl}</td>
                      <td className="p-2">{q.type}</td>
                      <td className="p-2">{formatCourseOutcomes(q)}</td>
                      <td className="p-2">
                        <Button size="sm" variant="outline" onClick={() => setEditingQ(q)}>Edit</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
                  {/* Pagination controls */}
                  {questions.length > 0 && (
                    <div className="flex justify-center items-center gap-2 mt-4">
                      <Button variant="outline" size="sm" onClick={() => setQuestionsPage(p => Math.max(1, p - 1))} disabled={questionsPage === 1}>Prev</Button>
                      <span>Page {questionsPage} of {totalQuestionsPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setQuestionsPage(p => Math.min(totalQuestionsPages, p + 1))} disabled={questionsPage === totalQuestionsPages}>Next</Button>
                    </div>
                  )}

          {/* Edit Single Question Dialog */}
          <Dialog open={!!editingQ} onOpenChange={v => { if (!v) setEditingQ(null); }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Question</DialogTitle>
              </DialogHeader>
              {editingQ && (
                <EditableQuestionRow
                  question={editingQ}
                  onSave={async (updated) => {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) return;
                    const numsMatch = String(updated.course_outcomes || '').match(/\d+/g) || [];
                    const coNums = numsMatch.length ? Array.from(new Set(numsMatch)).join(',') : null;
                    await supabase
                      .from("question_bank")
                      .update({
                        question_text: updated.question_text,
                        course_outcomes: updated.course_outcomes,
                        btl: updated.btl,
                        marks: updated.marks,
                        course_outcomes_numbers: coNums,
                      })
                      .eq("id", editingQ.id)
                      .eq("user_id", user.id);
                    setQuestions((prev) => prev.map((qq) => qq.id === editingQ.id ? { ...qq, ...updated, course_outcomes_numbers: coNums } : qq));
                    setEditingQ(null);
                  }}
                />
              )}
              <DialogFooter>
                <Button variant="secondary" onClick={() => setEditingQ(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
};

export default ManageQuestionsPage;
