import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, FileText } from "lucide-react";

type QuestionSpec = {
  type: 'objective' | 'descriptive';
  co: string;
  btl: string;
  marks?: number;
  isOr?: boolean;
};

type SectionSpec = {
  name: string;
  objectiveCount: number;
  descriptiveCount: number;
  marksPerQuestion: number;
  difficulty: { easy: number; medium: number; hard: number };
  questions: QuestionSpec[];
};

type Template = {
  id?: string | number;
  name: string;
  description?: string;
  total_marks: number;
  instructions?: string;
  sections: SectionSpec[];
};

const defaultSection = (name = 'Section A'): SectionSpec => ({
  name,
  objectiveCount: 0,
  descriptiveCount: 0,
  marksPerQuestion: 1,
  difficulty: { easy: 0, medium: 0, hard: 0 },
  questions: [],
});

export default function Templates() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [backendUrl, setBackendUrl] = useState<string>('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<Template>({
    name: '',
    description: '',
    total_marks: 100,
    instructions: '',
    sections: [defaultSection('Section A')],
  });

  useEffect(() => { const stored = localStorage.getItem('backendUrl'); if (stored) setBackendUrl(stored); }, []);

  const fetchTemplates = async () => {
    if (!backendUrl) return;
    try {
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/templates`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setTemplates(data || []);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to fetch templates', variant: 'destructive' });
    }
  };

  useEffect(() => { if (backendUrl) fetchTemplates(); }, [backendUrl]);

  const addSection = () => setNewTemplate({ ...newTemplate, sections: [...newTemplate.sections, defaultSection(`Section ${String.fromCharCode(65 + newTemplate.sections.length)}`)] });

  const updateSectionField = (idx: number, field: keyof SectionSpec, value: any) => { const s = [...newTemplate.sections]; s[idx] = { ...s[idx], [field]: value }; setNewTemplate({ ...newTemplate, sections: s }); };

  const setQuestionCount = (sIdx: number, count: number) => {
    const sections = [...newTemplate.sections];
    const existing = sections[sIdx].questions || [];
    if (count > existing.length) {
      const toAdd = Array.from({ length: count - existing.length }, () => ({ type: 'objective' as const, co: 'CO1', btl: 'random', marks: sections[sIdx].marksPerQuestion || 0, isOr: false }));
      sections[sIdx].questions = [...existing, ...toAdd];
    } else {
      sections[sIdx].questions = existing.slice(0, count);
    }
    sections[sIdx].objectiveCount = sections[sIdx].questions.filter(q => q.type === 'objective').length;
    sections[sIdx].descriptiveCount = sections[sIdx].questions.filter(q => q.type === 'descriptive').length;
    setNewTemplate({ ...newTemplate, sections });
  };

  const updateQuestion = (sIdx: number, qIdx: number, patch: Partial<QuestionSpec>) => { const sections = [...newTemplate.sections]; sections[sIdx].questions = sections[sIdx].questions.map((q, i) => i === qIdx ? { ...q, ...patch } : q); setNewTemplate({ ...newTemplate, sections }); };

  const createTemplate = async () => {
    if (!backendUrl) { toast({ title: 'Backend URL', description: 'Set backend URL to save templates', variant: 'destructive' }); return; }
    try {
      const body = { ...newTemplate };
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/templates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('create failed');
      toast({ title: 'Success', description: 'Template created' });
      setIsCreateDialogOpen(false);
      fetchTemplates();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to create template', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/dashboard')}><ArrowLeft className="w-4 h-4 mr-2"/>Back</Button>
            <h1 className="text-2xl font-bold text-primary">Manage Templates</h1>
          </div>
          <div className="flex items-center gap-2">
            <Input placeholder="Backend URL" value={backendUrl} onChange={(e) => { setBackendUrl(e.target.value); localStorage.setItem('backendUrl', e.target.value); }} />
            <Button variant="outline" onClick={fetchTemplates}>Load</Button>
            <Button onClick={() => setIsCreateDialogOpen(true)}><Plus className="w-4 h-4 mr-2"/>Create Template</Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((t) => (
            <Card key={String(t.id)}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-primary"/>{t.name}</CardTitle>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total Marks</span><span className="font-semibold">{t.total_marks}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Sections</span><span className="font-semibold">{t.sections?.length || 0}</span></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Template</DialogTitle></DialogHeader>
          <div className="space-y-6">
            <div className="grid gap-4">
              <div>
                <Label>Template Name</Label>
                <Input value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={newTemplate.description} onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Total Marks</Label>
                  <Input type="number" value={newTemplate.total_marks} onChange={(e) => setNewTemplate({ ...newTemplate, total_marks: parseInt(e.target.value || '0') })} />
                </div>
                <div>
                  <Label>Instructions</Label>
                  <Input value={newTemplate.instructions} onChange={(e) => setNewTemplate({ ...newTemplate, instructions: e.target.value })} />
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Sections</h3>
                <Button variant="outline" size="sm" onClick={addSection}><Plus className="w-4 h-4 mr-2"/>Add Section</Button>
              </div>
              <div className="space-y-4">
                {newTemplate.sections.map((t, sIdx) => (
                  <Card key={sIdx}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">{t.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                          <Label>Objective Questions</Label>
                          <Input type="number" value={t.objectiveCount} onChange={(e) => updateSectionField(sIdx, 'objectiveCount', parseInt(e.target.value || '0'))} />
                        </div>
                        <div>
                          <Label>Descriptive Questions</Label>
                          <Input type="number" value={t.descriptiveCount} onChange={(e) => updateSectionField(sIdx, 'descriptiveCount', parseInt(e.target.value || '0'))} />
                        </div>
                        <div>
                          <Label>Marks / Question</Label>
                          <Input type="number" value={t.marksPerQuestion} onChange={(e) => updateSectionField(sIdx, 'marksPerQuestion', parseInt(e.target.value || '0'))} />
                        </div>
                      </div>
                      <div className="mb-3">
                        <Label className="text-xs">Set # Questions (will add default specs)</Label>
                        <Input type="number" className="w-32" value={t.questions.length} onChange={(e) => setQuestionCount(sIdx, Math.max(0, parseInt(e.target.value || '0')))} />
                      </div>
                      <div className="space-y-3">
                        {t.questions.map((q, qIdx) => (
                          <div key={qIdx} className="border rounded p-3">
                            <div className="grid grid-cols-6 gap-2 items-start">
                              <div>
                                <Label className="text-xs">Type</Label>
                                <select className="w-full text-sm" value={q.type} onChange={(e) => updateQuestion(sIdx, qIdx, { type: e.target.value as any })}>
                                  <option value="objective">Objective</option>
                                  <option value="descriptive">Descriptive</option>
                                </select>
                              </div>
                              <div className="col-span-2 flex items-end text-xs text-muted-foreground">Will fetch random question</div>
                              <div>
                                <Label className="text-xs">CO</Label>
                                <select className="w-full text-sm" value={q.co} onChange={(e) => updateQuestion(sIdx, qIdx, { co: e.target.value })}>
                                  <option value="CO1">CO1</option>
                                  <option value="CO2">CO2</option>
                                  <option value="CO3">CO3</option>
                                  <option value="CO4">CO4</option>
                                  <option value="CO5">CO5</option>
                                </select>
                              </div>
                              <div>
                                <Label className="text-xs">BTL</Label>
                                <select className="w-full text-sm" value={q.btl} onChange={(e) => updateQuestion(sIdx, qIdx, { btl: e.target.value })}>
                                  <option value="random">Random</option>
                                  <option value="BTL1">BTL1</option>
                                  <option value="BTL2">BTL2</option>
                                  <option value="BTL3">BTL3</option>
                                  <option value="BTL4">BTL4</option>
                                  <option value="BTL5">BTL5</option>
                                  <option value="BTL6">BTL6</option>
                                </select>
                              </div>
                              <div>
                                <Label className="text-xs">Marks</Label>
                                <Input type="number" value={q.marks || ''} onChange={(e) => updateQuestion(sIdx, qIdx, { marks: parseInt(e.target.value || '0') })} />
                              </div>
                              <div className="flex items-end gap-2">
                                <Label className="text-xs">OR</Label>
                                <input type="checkbox" className="h-4 w-4" checked={!!q.isOr} onChange={(e) => updateQuestion(sIdx, qIdx, { isOr: e.target.checked })} />
                                <span className="text-[10px] text-muted-foreground">{qIdx === 0 ? 'Base question' : 'Alternative'}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={createTemplate}>Create Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
