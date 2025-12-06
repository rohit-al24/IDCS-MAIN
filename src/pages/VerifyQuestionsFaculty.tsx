import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const VerifyQuestionsFaculty = () => {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // assignedBanks will store objects { id, title, count }
  const [assignedBanks, setAssignedBanks] = useState<Array<{id: string; title: string; count?: number}>>([]);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [selectedBankTitle, setSelectedBankTitle] = useState<string | null>(null);
  const navigate = useNavigate();
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>({ errors: [] });
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    const fetchQuestions = async () => {
      setLoading(true);
      // 1. Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setQuestions([]); setLoading(false); return; }
      // 2. Get assigned question_bank_ids for this faculty
      const { data: assignedRows, error: assignErr } = await (supabase as any)
        .from("faculty_question_banks")
        .select("question_bank_id")
        .eq("faculty_user_id", user.id);
      setDebugInfo((d: any) => ({ ...d, assignedRows, assignErr }));
      if (assignErr || !assignedRows || assignedRows.length === 0) {
        setAssignedBanks([]); setQuestions([]); setLoading(false); return;
      }
      const assignedIds = assignedRows.map((r: any) => r.question_bank_id);
      // 3. Resolve those IDs to titles
      const { data: titleRows, error: titleErr } = await (supabase as any)
        .from("question_bank_titles")
        .select("id, title")
        .in("id", assignedIds);
      setDebugInfo((d: any) => ({ ...d, titleRows, titleErr }));
      if (titleErr || !titleRows || titleRows.length === 0) {
        setAssignedBanks([]); setQuestions([]); setLoading(false); return;
      }
      const banks = (titleRows || []).map((r: any) => ({ id: r.id, title: r.title }));
      // For each bank, fetch pending count (try title_id then fallback to title)
      const banksWithCounts = await Promise.all(
        banks.map(async (b) => {
          try {
            const { count } = await supabase
              .from('question_bank')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending')
              .eq('title_id', b.id);
            if ((count || 0) > 0) return { ...b, count: count || 0 };
            // fallback by title text
            const { count: c2 } = await supabase
              .from('question_bank')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending')
              .eq('title', b.title);
            return { ...b, count: c2 || 0 };
          } catch (e) {
            console.error('Error fetching counts for bank', b, e);
            setDebugInfo((d: any) => ({ ...d, errors: [...(d.errors||[]), { where: 'count', bank: b, error: String(e) }] }));
            return { ...b, count: 0 };
          }
        })
      );
      setDebugInfo((d: any) => ({ ...d, banksWithCounts }));
      setAssignedBanks(banksWithCounts);
      // Auto-select first bank if none selected
      if (banks.length > 0 && !selectedBankId) {
        const first = banks[0];
        setSelectedBankId(first.id);
        // fetch questions for the first bank (same logic as click)
        let { data, error } = await supabase
          .from('question_bank')
          .select('id, question_text, status, title, title_id')
          .eq('status', 'pending')
          .eq('title_id', first.id)
          .limit(100);
        if ((!data || data.length === 0) && first.title) {
          const fallback = await supabase
            .from('question_bank')
            .select('id, question_text, status, title, title_id')
            .eq('status', 'pending')
            .eq('title', first.title)
            .limit(100);
          if (!fallback.error) data = fallback.data;
        }
        if (!error && data) {
          setQuestions(data || []);
          setDebugInfo((d: any) => ({ ...d, lastFetch: { by: 'auto-first', data, error } }));
        } else {
          setQuestions([]);
          setDebugInfo((d: any) => ({ ...d, lastFetch: { by: 'auto-first', data: data || null, error: String(error || '') } }));
        }
        setLoading(false);
        return; // prevent later selectedBankId check (state update is async)
      }
      // 4. If a bank is selected, fetch questions for that bank only
      if (!selectedBankId) {
        setQuestions([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("question_bank")
        .select("id, question_text, status, title, title_id")
        .eq("status", "pending")
        .eq("title_id", selectedBankId)
        .limit(100);
      if (!error && data) setQuestions(data);
      else setQuestions([]);
      setLoading(false);
    };
    fetchQuestions();
  }, []);

  return (
    <div className="container mx-auto px-4 py-12">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Verify Questions</CardTitle>
          {assignedBanks.length > 0 && (
            <div className="mt-2 text-xs text-primary">
              Assigned Banks: {assignedBanks.map(b => b.title).join(", ")}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {assignedBanks.map((b) => (
                <div
                  key={b.id}
                  className={`p-3 border rounded-lg cursor-pointer shadow-sm hover:shadow-md ${selectedBankId === b.id ? 'border-primary bg-primary/5' : ''}`}
                  onClick={() => {
                    setSelectedBankId(b.id);
                    setSelectedBankTitle(b.title);
                    navigate(`/faculty/verify/${b.id}`);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{b.title}</div>
                    <div className="text-xs text-muted-foreground">{(b.count ?? 0)} pending</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Click to view questions</div>
                </div>
              ))}
            </div>
          </div>

          {selectedBankId ? (
            loading ? (
              <div className="text-muted-foreground">Loading questions...</div>
            ) : questions.length === 0 ? (
              <div className="text-muted-foreground">No questions to verify in this bank.</div>
            ) : (
              <ul className="space-y-4">
                {questions.map((q) => (
                  <li key={q.id} className="border-b pb-4">
                    <div className="font-medium text-lg mb-2">{q.question_text}</div>
                    <div className="flex gap-2">
                      <button className="px-4 py-1 bg-green-600 text-white rounded" onClick={async () => {
                        // Approve
                        const { error } = await supabase.from('question_bank').update({ status: 'verified', updated_at: new Date().toISOString() }).eq('id', q.id);
                        if (error) {
                          console.error('Approve error', error);
                        } else {
                          setQuestions((prev) => prev.filter((x) => x.id !== q.id));
                        }
                      }}>Approve</button>
                      <button className="px-4 py-1 bg-red-600 text-white rounded" onClick={async () => {
                        // Reject
                        const { error } = await supabase.from('question_bank').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', q.id);
                        if (error) {
                          console.error('Reject error', error);
                        } else {
                          setQuestions((prev) => prev.filter((x) => x.id !== q.id));
                        }
                      }}>Reject</button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="text-muted-foreground">Select an assigned bank to view its pending questions.</div>
          )}
          {/* Debug panel toggle and output */}
          <div className="mt-4">
            <button className="text-xs text-muted-foreground underline" onClick={() => setDebugOpen(v => !v)}>{debugOpen ? 'Hide' : 'Show'} debug info</button>
            {debugOpen && (
              <div className="mt-2">
                <div className="mb-2 text-xs">Assigned banks debug actions:</div>
                {assignedBanks.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 mb-2">
                    <div className="text-sm">{b.title} ({b.count ?? 0})</div>
                    <button className="text-xs px-2 py-1 bg-secondary/10 rounded" disabled={seeding} onClick={async () => {
                      setSeeding(true);
                      try {
                        const { data: { user } } = await supabase.auth.getUser();
                        const samples = Array.from({ length: 3 }).map((_, i) => ({
                          question_text: `SEED [${b.title}] sample ${i+1}`,
                          type: 'objective',
                          options: JSON.stringify(null),
                          correct_answer: null,
                          answer_text: null,
                          btl: 2,
                          marks: 1,
                          status: 'pending',
                          title_id: b.id,
                          user_id: user?.id || null,
                        }));
                        const { data, error } = await (supabase as any).from('question_bank').insert(samples).select();
                        setDebugInfo((d: any) => ({ ...d, lastSeed: { bank: b, data, error } }));
                        if (error) console.error('Seed error', error);
                        else {
                          // refresh counts
                          const { count } = await supabase.from('question_bank').select('id', { count: 'exact', head: true }).eq('status','pending').eq('title_id', b.id);
                          setAssignedBanks((prev) => prev.map(p => p.id === b.id ? { ...p, count: count || 0 } : p));
                        }
                      } catch (e) {
                        console.error(e);
                        setDebugInfo((d: any) => ({ ...d, errors: [...(d.errors||[]), String(e)] }));
                      }
                      setSeeding(false);
                    }}>Seed 3 pending</button>
                  </div>
                ))}
                <pre className="mt-2 p-2 bg-slate-50 text-xs overflow-auto max-h-64">{JSON.stringify(debugInfo, null, 2)}</pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyQuestionsFaculty;
