import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Lists question banks assigned to the logged-in faculty and navigates to per-bank verify page
const VerifyQuestionsFaculty = () => {
  const navigate = useNavigate();
  const [assignedBanks, setAssignedBanks] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchAssignedBanks = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAssignedBanks([]); setLoading(false); return; }
      // Get assigned question_bank_ids for this faculty
      const { data: assignedRows, error: assignErr } = await supabase
        .from('faculty_question_banks')
        .select('question_bank_id')
        .eq('faculty_user_id', user.id);
      if (assignErr) { setAssignedBanks([]); setLoading(false); return; }
      const ids = Array.from(new Set((assignedRows || []).map((r: any) => r.question_bank_id).filter(Boolean)));
      if (ids.length === 0) { setAssignedBanks([]); setLoading(false); return; }
      // Fetch titles for these ids
      const { data: titles, error: titleErr } = await supabase
        .from('question_bank_titles')
        .select('id, title')
        .in('id', ids);
      if (titleErr) { setAssignedBanks([]); setLoading(false); return; }
      setAssignedBanks((titles || []).map((t: any) => ({ id: t.id, title: t.title })));
      setLoading(false);
    };
    fetchAssignedBanks();
  }, []);

  const filtered = assignedBanks.filter(b => (b.title || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-3xl mx-auto mb-4">
        <Input placeholder="Search assigned banks..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? (
        <div className="text-muted-foreground text-center">Loading assigned banks...</div>
      ) : filtered.length === 0 ? (
        <div className="text-muted-foreground text-center">No assigned question banks.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {filtered.map((b) => (
            <Card key={b.id} className="cursor-pointer" onClick={() => navigate(`/faculty/verify/${b.id}`)}>
              <CardHeader>
                <CardTitle className="truncate">{b.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">Click to verify questions</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default VerifyQuestionsFaculty;
