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
  const [assignedBanks, setAssignedBanks] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [assignedBankInfo, setAssignedBankInfo] = useState<Array<any>>([]);
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null);
  const [sampleRows, setSampleRows] = useState<any[] | null>(null);
  const [titleSearch, setTitleSearch] = useState<string>("");
  // Splash/loading state for faculty
  const [splashLoading, setSplashLoading] = useState(false);

  // Helpers for display: CO numbers and unified Type label
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const extractNumbers = (s?: string | null): string | null => {
    if (!s || typeof s !== "string") return null;
    const seen = new Set<string>();
    const out: string[] = [];
    const matches = s.match(/[1-5]/g);
    if (matches) {
    setImagePreview(null);
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

  // Upload image as data URL to Supabase Storage and return its public URL (like UploadQuestions)
  const uploadImageToStorage = async (file: File, key: string): Promise<string | null> => {
    try {
      const bucket = 'question-images';
      // Convert file to data URL
      const toDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const dataUrl = await toDataUrl(file);
      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        console.warn('[uploadImageToStorage] Not a valid image data URL:', dataUrl?.slice(0, 100));
        return null;
      }
      const arr = dataUrl.split(',');
      if (arr.length < 2) {
        console.warn('[uploadImageToStorage] Malformed dataUrl:', dataUrl.slice(0, 100));
        return null;
      }
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) {
        u8arr[i] = bstr.charCodeAt(i);
      }
      const uploadFile = new File([u8arr], key, { type: mime });
      const path = `${key}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, uploadFile, { upsert: true });
      if (upErr) {
        console.error('[uploadImageToStorage] upload error', upErr);
        return null;
      }
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
      return publicData?.publicUrl || null;
    } catch (err) {
      console.error('[uploadImageToStorage] failed', err);
      return null;
    }
  };

  useEffect(() => {
    // load assigned banks first, then fetch questions scoped to selection
    (async () => {
      setSplashLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setSplashLoading(false);
          return;
        }
        setCurrentUserId(user.id);
        setSelectedUserName(user.user_metadata?.full_name || user.email || null);
        // fetch role for this user
        let role = null;
        try {
          const { data: roleRows } = await (supabase as any)
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .limit(1);
          if (Array.isArray(roleRows) && roleRows.length && 'role' in roleRows[0]) role = (roleRows[0] as any).role || null;
          setCurrentUserRole(role);
        } catch (e) {
          console.warn("failed to fetch user role", e);
        }

        // load assigned bank ids for this user
        const { data: assignments, error: assignErr } = await (supabase as any)
          .from("faculty_question_banks")
          .select("question_bank_id")
          .eq("faculty_user_id", user.id);
        if (assignErr) {
          console.warn("Failed to fetch faculty assignments", assignErr);
        }
        const bankIds = (assignments || []).map((r: any) => r.question_bank_id).filter(Boolean);

        if (bankIds.length) {
          // fetch titles for those ids
          const { data: titles } = await (supabase as any)
            .from("question_bank_titles")
            .select("id, title")
            .in("id", bankIds);
          const titlesArr = Array.isArray(titles) ? titles : [];
          setAssignedBanks(titlesArr);
          // collect counts per assigned bank for diagnostics
          const infos: any[] = [];
          for (const t of titlesArr) {
            const pendingRes = await (supabase as any)
              .from("question_bank")
              .select("id", { count: "exact", head: true })
              .eq("title_id", t.id)
              .eq("status", "pending");
            const verifiedRes = await (supabase as any)
              .from("question_bank")
              .select("id", { count: "exact", head: true })
              .eq("title_id", t.id)
              .eq("status", "verified");
            infos.push({ id: t.id, title: t.title, pending: pendingRes?.count || 0, verified: verifiedRes?.count || 0 });
          }
          setAssignedBankInfo(infos);
          // always auto-select first assigned bank for faculty
          if (role === 'faculty' && titlesArr.length) {
            setSelectedBankId(titlesArr[0].id);
            // Only fetch for the first assigned bank, do not call fetchQuestions() with no bankId
            await fetchQuestions(titlesArr[0].id);
            setSplashLoading(false);
            return;
          } else if (titlesArr.length) {
            // For admin or other roles, allow fallback to all
            await fetchQuestions();
            setSplashLoading(false);
            return;
          }
        }

        // no assignments or fallback: fetch unscoped (admin/other only)
        if (role !== 'faculty') {
          await fetchQuestions();
        }
      } catch (err) {
        console.warn("init fetch error", err);
        await fetchQuestions();
      }
      setSplashLoading(false);
    })();
    // eslint-disable-next-line
  }, []);

  // refetch when selected bank changes
  useEffect(() => {
    fetchQuestions(selectedBankId || undefined);
    // also load a couple sample rows for diagnostics when a bank is selected
    (async () => {
      if (!selectedBankId) { setSampleRows(null); return; }
      try {
        const { data } = await (supabase as any)
          .from("question_bank")
          .select("id, question_text, status, title_id")
          .eq("title_id", selectedBankId)
          .limit(5);
        setSampleRows(data || []);
      } catch (e) {
        console.warn("sample rows fetch error", e);
        setSampleRows(null);
      }
    })();
    // eslint-disable-next-line
  }, [selectedBankId]);

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

  const fetchQuestions = async (bankId?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch all counts (scope by title_id if bankId provided)
      let pendingCountQ: any = supabase
        .from("question_bank")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      let verifiedCountQ: any = supabase
        .from("question_bank")
        .select("id", { count: "exact", head: true })
        .eq("status", "verified");
      if (bankId) {
        pendingCountQ = pendingCountQ.eq("title_id", bankId);
        verifiedCountQ = verifiedCountQ.eq("title_id", bankId);
      }

      // pending = unverified, verified = verified
      const [{ count: unverifiedCount }, { count: verifiedCount }] = await Promise.all([
        pendingCountQ,
        verifiedCountQ,
      ]);
      setTotalUnverified(unverifiedCount || 0);
      setTotalVerified(verifiedCount || 0);

      // Fetch all for each status (no pagination), scoped if bankId provided
      // unverified -> pending, verified -> verified
      let unverifiedQ: any = supabase
        .from("question_bank")
        .select("*")
        .eq("status", "pending");
      let verifiedQ: any = supabase
        .from("question_bank")
        .select("*")
        .eq("status", "verified");
      if (bankId) {
        unverifiedQ = unverifiedQ.eq("title_id", bankId);
        verifiedQ = verifiedQ.eq("title_id", bankId);
      }

      const [{ data: unverified }, { data: verified }] = await Promise.all([
        unverifiedQ,
        verifiedQ,
      ]);
      let uRows = unverified || [];
      let vRows = verified || [];

      // If scoped by title_id provided but returned no rows, try a client-side title-text filter
      if (bankId && uRows.length === 0 && vRows.length === 0) {
        try {
          const { data: allPending } = await supabase
            .from("question_bank")
            .select("*")
            .eq("status", "pending");
          const { data: allVerified } = await supabase
            .from("question_bank")
            .select("*")
            .eq("status", "verified");

          const bankTitle = (assignedBanks.find(b => b.id === bankId)?.title || "").toLowerCase().replace(/[_\s]+/g, " ").trim();
          const norm = (s: any) => (String(s || "").toLowerCase().replace(/[_\s]+/g, " ").trim());

          // pending => unverified rows, verified => verified rows
          uRows = (allPending || []).filter((r: any) => norm(r.title).includes(bankTitle));
          vRows = (allVerified || []).filter((r: any) => norm(r.title).includes(bankTitle));
        } catch (e) {
          console.warn("fallback title-text filter failed", e);
        }
      }

      setUnverifiedQuestions(uRows || []);
      setVerifiedQuestions(vRows || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to fetch questions", variant: "destructive" });
    }
  };

  const openEditDialog = (question: Question) => {
    setSelectedQuestion(question);
    setEditedQuestion(question);
    setIsEditDialogOpen(true);
  };

  // Activity logging helper: writes a row to question_activity_logs
  const logActivity = async (payload: { action: string; question_id: string; title_id?: string | null; details?: any }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const row = {
        user_id: user?.id || null,
        action: payload.action,
        question_id: payload.question_id,
        title_id: payload.title_id || null,
        details: payload.details || null,
      };
      await supabase.from('question_activity_logs').insert([row]);
    } catch (e) {
      console.warn('logActivity failed', e);
    }
  };

  const computeChanges = (before: any, after: any) => {
    const out: Record<string, { before: any; after: any }> = {};
    if (!after) return out;
    for (const k of Object.keys(after)) {
      const a = (after as any)[k];
      const b = before ? (before as any)[k] : undefined;
      try {
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          out[k] = { before: b, after: a };
        }
      } catch (e) {
        if (a !== b) out[k] = { before: b, after: a };
      }
    }
    return out;
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
      // log activity for this change
      try {
        const after = { ...(selectedQuestion as any), ...editedQuestion, status: 'pending', updated_at: new Date().toISOString() };
        const details = computeChanges(selectedQuestion, after);
        await logActivity({ action: 'unverify', question_id: selectedQuestion.id, title_id: (selectedQuestion as any).title_id, details });
      } catch (e) {
        console.warn('failed to log unverify activity', e);
      }
      setIsEditDialogOpen(false);
      fetchQuestions(selectedBankId || undefined);
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
      // log activity for this change
      try {
        const after = { ...(selectedQuestion as any), ...editedQuestion, status: 'verified', updated_at: new Date().toISOString() };
        const details = computeChanges(selectedQuestion, after);
        await logActivity({ action: 'verify', question_id: selectedQuestion.id, title_id: (selectedQuestion as any).title_id, details });
      } catch (e) {
        console.warn('failed to log verify activity', e);
      }
      setIsEditDialogOpen(false);
      fetchQuestions(selectedBankId || undefined);
    } catch (error) {
      toast({ title: "Error", description: "Failed to mark as verified", variant: "destructive" });
    }
  };

  // Pagination helpers removed; show all
  const getPage = (arr: Question[]) => arr;

  // Splash screen for faculty users while loading
  if (currentUserRole === 'faculty' && splashLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-primary border-solid"></div>
          <div className="text-lg font-semibold text-primary">Loading your assigned question banks...</div>
        </div>
      </div>
    );
  }

  // For faculty: if no bank is selected, show a bank selection screen
  if (currentUserRole === 'faculty' && assignedBanks.length > 0 && !selectedBankId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="flex flex-col items-center gap-6 p-8 bg-card rounded-lg shadow-lg">
          <h2 className="text-xl font-bold mb-2">Select a Question Bank to Verify</h2>
          <Select
            value={selectedBankId ?? ''}
            onValueChange={v => setSelectedBankId(v)}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select question bank" />
            </SelectTrigger>
            <SelectContent>
              {assignedBanks.map((b: any) => (
                <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

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
        <div className="mb-6 flex items-start justify-between gap-4">
            <div className="text-sm text-muted-foreground">
            <div>
              <strong>User:</strong> {selectedUserName || "—"}
            </div>
            <div>
              <strong>Assigned banks:</strong>
              {assignedBankInfo.length ? (
              <ul className="list-disc ml-4">
              </ul>
              ) : (
              <span> {assignedBanks.length ? assignedBanks.map(b => b.title).join(", ") : 'None'}</span>
              )}
            </div>
          </div>

            <div className="flex items-center gap-2">
            <label className="text-sm">Scope bank:</label>
            {/* For faculty, omit the All Banks option */}
            <Select
              value={currentUserRole === 'faculty' ? (selectedBankId ?? (assignedBanks.length ? assignedBanks[0].id : '__no')) : (selectedBankId ?? '__all')}
              onValueChange={(v) => {
              if (v === '__all' || v === '__no') setSelectedBankId(null);
              else setSelectedBankId(v);
              }}
            >
              <SelectTrigger className="w-56">
              <SelectValue placeholder={assignedBanks.length ? "Select bank" : "All banks"} />
              </SelectTrigger>
              <SelectContent>
              {currentUserRole === 'faculty' ? null : <SelectItem value="__all">All Banks</SelectItem>}
              {assignedBanks.map((b: any) => (
                <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
              ))}
              </SelectContent>
            </Select>
            </div>
        </div>

        <Tabs defaultValue="verified" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="verified">
              Unverified ({totalUnverified})
            </TabsTrigger>
            <TabsTrigger value="unverified">
              Verified ({totalVerified})
            </TabsTrigger>
          </TabsList>

          {/* Unverified tab: shows status 'pending' questions */}
          <TabsContent value="verified">
            <Card>
              <CardHeader>
                <CardTitle>Unverified Questions</CardTitle>
              </CardHeader>
              <CardContent>
                {unverifiedQuestions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No pending questions yet</p>
                ) : (
                  <>
                    <div className="mb-4 flex gap-2 items-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === getPage(unverifiedQuestions).length && getPage(unverifiedQuestions).length > 0}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedIds(getPage(unverifiedQuestions).map(q => q.id));
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
                            const updated_at = new Date().toISOString();
                            const { error } = await supabase
                              .from("question_bank")
                              .update({ status: "verified", updated_at })
                              .in("id", ids);
                            if (error) throw error;
                            // log each change
                            try {
                              for (const id of ids) {
                                const before = unverifiedQuestions.find(q => q.id === id) as any;
                                const after = { ...before, status: 'verified', updated_at };
                                const details = computeChanges(before, after);
                                await logActivity({ action: 'verify', question_id: id, title_id: before?.title_id, details });
                              }
                            } catch (e) {
                              console.warn('failed to log bulk verify activities', e);
                            }
                            toast({ title: "Success", description: "Selected questions marked as verified" });
                            setSelectedIds([]);
                            fetchQuestions(selectedBankId || undefined);
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
                          {getPage(unverifiedQuestions).map((q, idx) => (
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
                              <TableCell>{idx + 1}</TableCell>
                              <TableCell className="max-w-md">
                                <div className="flex flex-col gap-2">
                                  <p className="whitespace-pre-line break-words">{q.question_text}</p>
                                  {(imageSrcs[q.id] || q.image_url) ? (
                                    <img src={imageSrcs[q.id] || q.image_url} alt="Question" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 4 }} />
                                  ) : null}
                                  <Button size="sm" variant="outline" onClick={() => { setSelectedQuestion(q); setEditedQuestion(q); setIsEditDialogOpen(true); }}>
                                    <Edit className="w-4 h-4 mr-1" /> Edit
                                  </Button>
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
                    {/* Pagination controls removed */}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Verified tab: shows status 'verified' questions */}
          <TabsContent value="unverified">
            <Card>
              <CardHeader>
                <CardTitle>Verified Questions</CardTitle>
              </CardHeader>
              <CardContent>
                {verifiedQuestions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No verified questions</p>
                ) : (
                  <>
                    <div className="mb-4 flex gap-2 items-center">
                      <input
                        type="checkbox"
                        checked={selectedUnverifiedIds.length === getPage(verifiedQuestions).length && getPage(verifiedQuestions).length > 0}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedUnverifiedIds(getPage(verifiedQuestions).map(q => q.id));
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
                            const updated_at = new Date().toISOString();
                            const { error } = await supabase
                              .from("question_bank")
                              .update({ status: "pending", updated_at })
                              .in("id", ids);
                            if (error) throw error;
                            // log each change
                            try {
                              for (const id of ids) {
                                const before = verifiedQuestions.find(q => q.id === id) as any;
                                const after = { ...before, status: 'pending', updated_at };
                                const details = computeChanges(before, after);
                                await logActivity({ action: 'unverify', question_id: id, title_id: before?.title_id, details });
                              }
                            } catch (e) {
                              console.warn('failed to log bulk unverify activities', e);
                            }
                            toast({ title: "Success", description: "Selected questions marked as unverified" });
                            setSelectedUnverifiedIds([]);
                            fetchQuestions(selectedBankId || undefined);
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
                          {getPage(verifiedQuestions).map((q, idx) => (
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
                              <TableCell>{idx + 1}</TableCell>
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
                    {/* Pagination controls removed */}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
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
                <Label>BTL</Label>
                <Input
                  value={editedQuestion.btl || ""}
                  onChange={(e) => setEditedQuestion({ ...editedQuestion, btl: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
              <div>
                <Label>CO</Label>
                <Input
                  value={editedQuestion.course_outcomes || ""}
                  onChange={(e) => setEditedQuestion({ ...editedQuestion, course_outcomes: e.target.value })}
                />
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
            <div>
              <Label>Image</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  // Show an immediate local preview while uploading
                  const reader = new FileReader();
                  reader.onload = async () => {
                    const localUrl = reader.result as string;
                    setEditedQuestion(prev => ({ ...prev, image_url: localUrl }));

                    // Build a predictable key using question id if available
                    const ext = (file.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
                    const qid = selectedQuestion?.id || `anon_${Date.now()}`;
                    const key = `verify/${qid}_${Date.now()}.${ext}`;

                    // Upload to Supabase and replace preview with public URL when ready
                    const publicUrl = await uploadImageToStorage(file, key);
                    if (publicUrl) {
                      setEditedQuestion(prev => ({ ...prev, image_url: publicUrl }));
                      if (selectedQuestion?.id) {
                        setImageSrcs(prev => ({ ...prev, [selectedQuestion.id]: publicUrl }));
                      }
                    } else {
                      toast({ title: 'Upload failed', description: 'Failed to upload image. Local preview shown.', variant: 'destructive' });
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
              {editedQuestion.image_url && (
                <img src={editedQuestion.image_url} alt="Question" className="mt-2 max-h-32" />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={markVerified}>Save & Mark as Verified</Button>
            <Button onClick={markPending} variant="secondary">Save & Mark as Unverified</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VerifyQuestions;
