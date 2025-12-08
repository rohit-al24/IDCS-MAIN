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

  // Small circular progress component
  const CircularProgress = ({ percent, size = 55, stroke = 4, ringScale = 1, textSize }: { percent: number; size?: number; stroke?: number; ringScale?: number; textSize?: number }) => {
    const baseRadius = (size - stroke) / 2;
    const radius = baseRadius * (ringScale ?? 1);
    const c = 2 * Math.PI * radius;
    const prevRef = React.useRef<number>(0);
    const [animatedPercent, setAnimatedPercent] = React.useState<number>(Math.max(0, Math.min(100, Math.round(prevRef.current))));

    React.useEffect(() => {
      const from = Math.max(0, Math.min(100, Math.round(prevRef.current || 0)));
      const to = Math.max(0, Math.min(100, Math.round(percent || 0)));
      const duration = 5000; // ms (slower animation)
      const start = performance.now();
      let raf = 0;
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeOutCubic(t);
        const current = Math.round(from + (to - from) * eased);
        setAnimatedPercent(current);
        if (t < 1) raf = requestAnimationFrame(step);
        else prevRef.current = to;
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }, [percent]);

    const capped = Math.max(0, Math.min(100, animatedPercent));
    const dash = (c * capped) / 100;
    // color thresholds: red if unverified >= 20%, amber <70, teal >=70, green when 100%
    const unverifiedPercent = 100 - capped;
    const strokeColor = capped === 100
      ? '#16a34a'
      : (unverifiedPercent >= 20 ? '#ef4444' : capped < 70 ? '#f59e0b' : '#06b6d4');
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          <circle r={radius} cx={0} cy={0} fill="none" stroke="#e6e6e6" strokeWidth={stroke} />
          <circle
            r={radius}
            cx={0}
            cy={0}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
            transform={`rotate(-90)`}
          />
          <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={textSize ?? Math.max(10, Math.floor(size / 4))} fill="#0f172a">
            {capped}%
          </text>
        </g>
      </svg>
    );
  };

  // Edit single question modal
  const [editingQ, setEditingQ] = useState(null);
  // Edit Qns Modal
  const [editQnsOpen, setEditQnsOpen] = useState(false);
  // Delete Bank
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // No pagination: show all questions on a single page

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
        // Fetch all questions for this user (we'll compute per-title totals and verified counts)
        const { data, error } = await supabase
          .from("question_bank")
          .select("id, title, status")
          .eq("user_id", user.id);
        if (error) {
          setErrorMsg(error.message);
          setBanks([]);
          setLoading(false);
          return;
        }
        const rows = data || [];
        // Build counts per title
        const stats: Record<string, { total: number; verified: number }> = {};
        for (const r of rows) {
          const t = (r.title || '').trim();
          if (!t) continue;
          if (!stats[t]) stats[t] = { total: 0, verified: 0 };
          stats[t].total += 1;
          if (r.status === 'verified') stats[t].verified += 1;
        }
        const items = Object.keys(stats).map(title => ({ title, total: stats[title].total, verified: stats[title].verified }));
        setBanks(items);
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
        // Fetch all verified questions for this bank (no pagination)
        const { data, error } = await supabase
          .from("question_bank")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "verified")
          .eq("title", selectedBank.title);
        if (error) { setQuestions([]); setQuestionsLoading(false); return; }
        setQuestions(data || []);
      } catch {
        setQuestions([]);
      }
      setQuestionsLoading(false);
    };
    fetchQuestions();
  }, [selectedBank]);

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
          {filteredBanks.map(bank => {
            const total = (bank.total ?? 0) as number;
            const verified = (bank.verified ?? 0) as number;
            const percent = total > 0 ? Math.round((verified / total) * 100) : 0;
            return (
              <Card
                key={bank.title}
                className="cursor-pointer transition-all duration-200 border border-primary/10 bg-primary/5 dark:bg-background/80 hover:border-primary/60 hover:shadow-xl group"
                style={{ minHeight: 80, display: 'flex', alignItems: 'center' }}
                onClick={() => setSelectedBank(bank)}
              >
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div style={{ flex: 1 }}>
                    <div className="text-xl font-semibold text-primary group-hover:text-primary/90 mb-0 truncate" style={{ wordBreak: 'break-word' }}>{bank.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{verified} verified • {total} total</div>
                  </div>
                  <div style={{ width: 64, height: 64 }}>
                    <CircularProgress percent={percent} size={64} stroke={6} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
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

          {/* Centered large circular progress inside bank view */}
          <div className="flex items-center justify-center py-6">
            {(() => {
              const total = (selectedBank?.total ?? 0) as number;
              const verified = (selectedBank?.verified ?? 0) as number;
              const percent = total > 0 ? Math.round((verified / total) * 100) : 0;
              return (
                <div className="text-center">
                  <div className="mx-auto" style={{ width: 180, height: 180 }}>
                    <CircularProgress percent={percent} size={180} stroke={12} ringScale={0.78} textSize={48} />
                  </div>
                  <div className="mt-3 text-lg font-semibold text-primary">{verified} / {total} verified</div>
                  <div className="text-sm text-muted-foreground">{percent}% verified</div>
                </div>
              );
            })()}
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
                                  .eq("title", selectedBank.title);
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
                  {/* pagination removed: all questions shown on single page */}

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
