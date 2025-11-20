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

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: unverified } = await supabase
        .from("question_bank")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "pending");

      const { data: verified } = await supabase
        .from("question_bank")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "verified");

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

  const verifyQuestion = async () => {
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

      toast({ title: "Success", description: "Question verified successfully" });
      setIsEditDialogOpen(false);
      fetchQuestions();
    } catch (error) {
      toast({ title: "Error", description: "Failed to verify question", variant: "destructive" });
    }
  };

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
        <Tabs defaultValue="unverified" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="unverified">
              Unverified ({unverifiedQuestions.length})
            </TabsTrigger>
            <TabsTrigger value="verified">
              Verified ({verifiedQuestions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="unverified">
            <Card>
              <CardHeader>
                <CardTitle>Unverified Questions</CardTitle>
              </CardHeader>
              <CardContent>
                {unverifiedQuestions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No unverified questions</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Question Text</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Difficulty</TableHead>
                          <TableHead>Marks</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unverifiedQuestions.map((q, idx) => (
                          <TableRow key={q.id}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell className="max-w-md truncate">{q.question_text}</TableCell>
                            <TableCell className="capitalize">{q.type}</TableCell>
                            <TableCell className="capitalize">{q.difficulty}</TableCell>
                            <TableCell>{q.marks}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(q)}
                              >
                                <CheckCircle className="w-4 h-4 mr-2 text-primary" />
                                Verify
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="verified">
            <Card>
              <CardHeader>
                <CardTitle>Verified Questions</CardTitle>
              </CardHeader>
              <CardContent>
                {verifiedQuestions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No verified questions yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Question Text</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Difficulty</TableHead>
                          <TableHead>Marks</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {verifiedQuestions.map((q, idx) => (
                          <TableRow key={q.id}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell className="max-w-md truncate">{q.question_text}</TableCell>
                            <TableCell className="capitalize">{q.type}</TableCell>
                            <TableCell className="capitalize">{q.difficulty}</TableCell>
                            <TableCell>{q.marks}</TableCell>
                            <TableCell>{q.unit || "-"}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(q)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit & Verify Question</DialogTitle>
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
            <Button onClick={verifyQuestion}>Verify & Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VerifyQuestions;
