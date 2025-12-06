import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const VerifyQuestionsBank = () => {
  const { bankId } = useParams();
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bankTitle, setBankTitle] = useState<string>("");

  useEffect(() => {
    const fetchQuestions = async () => {
      setLoading(true);
      // Get bank title
      const { data: titleRow } = await supabase
        .from("question_bank_titles")
        .select("title")
        .eq("id", bankId)
        .single();
      setBankTitle(titleRow?.title || "");
      // Get pending questions for this bank
      const { data, error } = await supabase
        .from("question_bank")
        .select("id, question_text, status, title, title_id")
        .eq("status", "pending")
        .eq("title_id", bankId)
        .limit(100);
      setQuestions(data || []);
      setLoading(false);
    };
    if (bankId) fetchQuestions();
  }, [bankId]);

  return (
    <div className="container mx-auto px-4 py-12">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Verify Questions for {bankTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
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
                      if (!error) setQuestions((prev) => prev.filter((x) => x.id !== q.id));
                    }}>Approve</button>
                    <button className="px-4 py-1 bg-red-600 text-white rounded" onClick={async () => {
                      // Reject
                      const { error } = await supabase.from('question_bank').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', q.id);
                      if (!error) setQuestions((prev) => prev.filter((x) => x.id !== q.id));
                    }}>Reject</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyQuestionsBank;
