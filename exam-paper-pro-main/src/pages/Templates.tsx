import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, FileText } from "lucide-react";

interface TemplateSection {
  name: string;
  objectiveCount: number;
  descriptiveCount: number;
  marksPerQuestion: number;
  difficulty: { easy: number; medium: number; hard: number };
  questions: TemplateQuestion[];
  typePattern?: string;
}

interface TemplateQuestion {
  type: 'objective' | 'descriptive';
  co: string;
  btl: string;
  marks?: number;
  isOr?: boolean;
}

interface Template {
  id: number;
  name: string;
  description: string;
  total_marks: number;
  instructions: string;
  sections: TemplateSection[];
}

interface TemplateQuestion {
  type: 'objective' | 'descriptive';
  co: string; // course outcome id
  btl: string; // Bloom level or 'random'
  marks?: number;
}

interface TemplateSection {
  name: string;
  objectiveCount: number;
  descriptiveCount: number;
  marksPerQuestion: number;
  difficulty: { easy: number; medium: number; hard: number };
  questions: TemplateQuestion[];
}

const Templates = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [backendUrl, setBackendUrl] = useState<string>('');
  const sanitizeBackend = (raw: string) => {
    if (!raw) return '';
    if (/^:?\d+$/.test(raw)) return `http://localhost${raw.startsWith(':') ? raw : ':' + raw}`;
    if (!/^https?:\/\//i.test(raw)) return `http://${raw}`;
    return raw.replace(/\/$/, '');
  };
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    total_marks: 100,
    instructions: "",
    sections: [
      {
        name: "Section A",
        objectiveCount: 10,
        descriptiveCount: 0,
        marksPerQuestion: 1,
        difficulty: { easy: 5, medium: 3, hard: 2 },
        questions: [] as TemplateQuestion[],
      },
    ] as TemplateSection[],
  });

  useEffect(() => {
    const stored = localStorage.getItem('backendUrl');
    if (stored) { setBackendUrl(stored); fetchTemplates(stored); }
  }, []);

  const fetchTemplates = async (override?: string) => {
    const base = sanitizeBackend(override ?? backendUrl);
    if (!base) return;
    try {
      const res = await fetch(`${base}/api/templates`);
      if (!res.ok) throw new Error('failed');
      const data: Template[] = await res.json();
      setTemplates(data || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to fetch templates", variant: "destructive" });
    }
  };

  const createTemplate = async () => {
    const base = sanitizeBackend(backendUrl);
    if (!base) { toast({ title: 'Backend URL Required', description: 'Enter backend URL first.', variant: 'destructive'}); return; }
    try {
      const sectionsForSave = newTemplate.sections.map(s => ({
        name: s.name,
        difficulty: s.difficulty,
        marksPerQuestion: s.marksPerQuestion,
        questions: s.questions,
        objectiveCount: s.questions.filter(q => q.type === 'objective').length,
        descriptiveCount: s.questions.filter(q => q.type === 'descriptive').length,
      }));
      const fd = new FormData();
      fd.append('name', newTemplate.name);
      fd.append('description', newTemplate.description);
      fd.append('total_marks', String(newTemplate.total_marks));
      fd.append('instructions', newTemplate.instructions);
      fd.append('sections', JSON.stringify(sectionsForSave));
      const res = await fetch(`${base}/api/templates`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('create failed');
      toast({ title: "Success", description: "Template created successfully" });
      setIsCreateDialogOpen(false);
      fetchTemplates(base);
      setNewTemplate({
        name: "",
        description: "",
        total_marks: 100,
        instructions: "",
        sections: [
          {
            name: "Section A",
            objectiveCount: 10,
            descriptiveCount: 0,
            marksPerQuestion: 2,
            difficulty: { easy: 5, medium: 3, hard: 2 },
            questions: [],
            typePattern: 'OBJECTIVE_ALL'
          },
        ],
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create template", variant: "destructive" });
    }
  };

  const addSection = () => {
    setNewTemplate({
      ...newTemplate,
      sections: [
        ...newTemplate.sections,
        {
          name: `Section ${String.fromCharCode(65 + newTemplate.sections.length)}`,
          objectiveCount: 0,
          descriptiveCount: 0,
          marksPerQuestion: 1,
          difficulty: { easy: 0, medium: 0, hard: 0 },
          questions: [],
        },
      ],
    });
  };

  const updateSection = (index: number, field: keyof TemplateSection, value: any) => {
    const updatedSections = [...newTemplate.sections];
    updatedSections[index] = { ...updatedSections[index], [field]: value } as TemplateSection;
    setNewTemplate({ ...newTemplate, sections: updatedSections });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold text-primary">Manage Templates</h1>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Input
              placeholder="Backend URL (e.g. http://localhost:4000)"
              value={backendUrl}
              onChange={e => { setBackendUrl(e.target.value); localStorage.setItem('backendUrl', e.target.value); }}
            />
            <Button variant="outline" onClick={() => fetchTemplates()}>Load</Button>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      {template.name}
                    </CardTitle>
                    <CardDescription className="mt-2">{template.description}</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Marks:</span>
                    <span className="font-semibold">{template.total_marks}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sections:</span>
                    <span className="font-semibold">{(template.sections as any[]).length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {templates.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">No templates yet. Create your first template!</p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid gap-4">
              <div>
                <Label>Template Name</Label>
                <Input
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  placeholder="e.g., Internal Test Template"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                  placeholder="Brief description of the template"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Total Marks</Label>
                  <Input
                    type="number"
                    value={newTemplate.total_marks}
                    onChange={(e) => setNewTemplate({ ...newTemplate, total_marks: parseInt(e.target.value) })}
                  />
                </div>

                <div>
                  <Label>Instructions</Label>
                  <Input
                    value={newTemplate.instructions}
                    onChange={(e) => setNewTemplate({ ...newTemplate, instructions: e.target.value })}
                    placeholder="Exam instructions"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Sections</h3>
                <Button type="button" variant="outline" size="sm" onClick={addSection}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Section
                </Button>
              </div>

              {newTemplate.sections.map((section, sIdx) => (
                <Card key={sIdx}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{section.name}</span>
                      <div className="flex gap-2 items-center">
                        <Label className="text-xs"># Questions</Label>
                        <Input
                          type="number"
                          className="w-20 h-8"
                          value={section.questions.length}
                          onChange={(e) => {
                            const count = Math.max(0, parseInt(e.target.value) || 0);
                            const updatedSections = [...newTemplate.sections];
                            const existing = updatedSections[sIdx].questions;
                            if (count > existing.length) {
                              const toAdd = Array.from({ length: count - existing.length }, () => ({
                                type: 'objective' as const,
                                co: 'CO1',
                                btl: 'BTL1'
                              }));
                              updatedSections[sIdx].questions = [...existing, ...toAdd];
                            } else {
                              updatedSections[sIdx].questions = existing.slice(0, count);
                            }
                            updatedSections[sIdx].objectiveCount = updatedSections[sIdx].questions.filter(q => q.type === 'objective').length;
                            updatedSections[sIdx].descriptiveCount = updatedSections[sIdx].questions.filter(q => q.type === 'descriptive').length;
                            setNewTemplate({ ...newTemplate, sections: updatedSections });
                          }}
                        />
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {section.questions.length === 0 && (
                      <p className="text-xs text-muted-foreground">Set number of questions to begin.</p>
                    )}
                    {section.questions.map((q, qIdx) => (
                      <div key={qIdx} className="border rounded p-3 space-y-2">
                        <div className="grid grid-cols-5 gap-2 items-start">
                          <div>
                            <Label className="text-xs">Type</Label>
                            <select
                              className="w-full text-sm border rounded h-8 px-2 bg-background"
                              value={q.type}
                              onChange={(e) => {
                                const val = e.target.value as 'objective' | 'descriptive';
                                const updatedSections = [...newTemplate.sections];
                                updatedSections[sIdx].questions[qIdx].type = val;
                                updatedSections[sIdx].objectiveCount = updatedSections[sIdx].questions.filter(x => x.type === 'objective').length;
                                updatedSections[sIdx].descriptiveCount = updatedSections[sIdx].questions.filter(x => x.type === 'descriptive').length;
                                setNewTemplate({ ...newTemplate, sections: updatedSections });
                              }}
                            >
                              <option value="objective">Objective</option>
                              <option value="descriptive">Descriptive</option>
                            </select>
                          </div>
                          <div className="col-span-2 flex items-end">
                            <p className="text-xs text-muted-foreground">Will fetch random question</p>
                          </div>
                          <div>
                            <Label className="text-xs">CO</Label>
                            <select
                              className="w-full text-sm border rounded h-8 px-2 bg-background"
                              value={q.co}
                              onChange={(e) => {
                                const updatedSections = [...newTemplate.sections];
                                updatedSections[sIdx].questions[qIdx].co = e.target.value;
                                setNewTemplate({ ...newTemplate, sections: updatedSections });
                              }}
                            >
                              <option value="CO1">CO1</option>
                              <option value="CO2">CO2</option>
                              <option value="CO3">CO3</option>
                              <option value="CO4">CO4</option>
                              <option value="CO5">CO5</option>
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">BTL</Label>
                            <select
                              className="w-full text-sm border rounded h-8 px-2 bg-background"
                              value={q.btl}
                              onChange={(e) => {
                                const updatedSections = [...newTemplate.sections];
                                updatedSections[sIdx].questions[qIdx].btl = e.target.value;
                                setNewTemplate({ ...newTemplate, sections: updatedSections });
                              }}
                            >
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
                            <select
                              className="w-full text-sm border rounded h-8 px-2 bg-background"
                              value={q.marks || ''}
                              onChange={(e) => {
                                const updatedSections = [...newTemplate.sections];
                                updatedSections[sIdx].questions[qIdx].marks = parseInt(e.target.value) || '';
                                setNewTemplate({ ...newTemplate, sections: updatedSections });
                              }}
                            >
                              <option value="">Select</option>
                              <option value="1">1</option>
                              <option value="2">2</option>
                              <option value="3">3</option>
                              <option value="4">4</option>
                              <option value="5">5</option>
                              <option value="10">10</option>
                              <option value="15">15</option>
                              <option value="20">20</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
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
};

export default Templates;
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, Edit, FileText } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Template = Tables<"templates">;

interface TemplateSection {
  name: string;
  objectiveCount: number;
  descriptiveCount: number;
  marksPerQuestion: number;
                        <div key={qIdx} className="border rounded p-3 space-y-2">
                          <div className="grid grid-cols-6 gap-2 items-start">
                            <div>
                              <Label className="text-xs">Type</Label>
                              <select
                                className="w-full text-sm border rounded h-8 px-2 bg-background"
                                value={q.type}
                                onChange={(e) => {
                                  const val = e.target.value as 'objective' | 'descriptive';
                                  const updatedSections = [...newTemplate.sections];
                                  updatedSections[sIdx].questions[qIdx].type = val;
                                  updatedSections[sIdx].objectiveCount = updatedSections[sIdx].questions.filter(x => x.type === 'objective').length;
                                  updatedSections[sIdx].descriptiveCount = updatedSections[sIdx].questions.filter(x => x.type === 'descriptive').length;
                                  setNewTemplate({ ...newTemplate, sections: updatedSections });
                                }}
                              >
                                <option value="objective">Objective</option>
                                <option value="descriptive">Descriptive</option>
                              </select>
                            </div>
                            <div>
                              <Label className="text-xs">CO</Label>
                              <select
                                className="w-full text-sm border rounded h-8 px-2 bg-background"
                                value={q.co}
                                onChange={(e) => {
                                  const updatedSections = [...newTemplate.sections];
                                  updatedSections[sIdx].questions[qIdx].co = e.target.value;
                                  setNewTemplate({ ...newTemplate, sections: updatedSections });
                                }}
                              >
                                <option value="CO1">CO1</option>
                                <option value="CO2">CO2</option>
                                <option value="CO3">CO3</option>
                                <option value="CO4">CO4</option>
                                <option value="CO5">CO5</option>
                              </select>
                            </div>
                            <div>
                              <Label className="text-xs">BTL</Label>
                              <select
                                className="w-full text-sm border rounded h-8 px-2 bg-background"
                                value={q.btl}
                                onChange={(e) => {
                                  const updatedSections = [...newTemplate.sections];
                                  updatedSections[sIdx].questions[qIdx].btl = e.target.value;
                                  setNewTemplate({ ...newTemplate, sections: updatedSections });
                                }}
                              >
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
                              <Input
                                className="w-full text-sm border rounded h-8 px-2 bg-background"
                                type="number"
                                value={q.marks || ''}
                                onChange={e => {
                                  const updatedSections = [...newTemplate.sections];
                                  updatedSections[sIdx].questions[qIdx].marks = parseInt(e.target.value) || 0;
                                  setNewTemplate({ ...newTemplate, sections: updatedSections });
                                }}
                              />
                            </div>
                          </div>
      if (error) throw error;

      toast({ title: "Success", description: "Template created successfully" });
      setIsCreateDialogOpen(false);
      fetchTemplates();
      
      setNewTemplate({
        name: "",
        description: "",
        total_marks: 100,
        instructions: "",
        sections: [
          {
            name: "Section A",
            objectiveCount: 10,
            descriptiveCount: 0,
            marksPerQuestion: 1,
            difficulty: { easy: 5, medium: 3, hard: 2 },
          },
        ],
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create template", variant: "destructive" });
    }
  };

  const addSection = () => {
    setNewTemplate({
      ...newTemplate,
      sections: [
        ...newTemplate.sections,
        {
          name: `Section ${String.fromCharCode(65 + newTemplate.sections.length)}`,
          objectiveCount: 0,
          descriptiveCount: 0,
          marksPerQuestion: 1,
          difficulty: { easy: 0, medium: 0, hard: 0 },
        },
      ],
    });
  };

  const updateSection = (index: number, field: keyof TemplateSection, value: any) => {
    const updatedSections = [...newTemplate.sections];
    updatedSections[index] = { ...updatedSections[index], [field]: value };
    setNewTemplate({ ...newTemplate, sections: updatedSections });
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
            <h1 className="text-2xl font-bold text-primary">Manage Templates</h1>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      {template.name}
                    </CardTitle>
                    <CardDescription className="mt-2">{template.description}</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Marks:</span>
                    <span className="font-semibold">{template.total_marks}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sections:</span>
                    <span className="font-semibold">{(template.sections as any[]).length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {templates.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">No templates yet. Create your first template!</p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid gap-4">
              <div>
                <Label>Template Name</Label>
                <Input
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  placeholder="e.g., Internal Test Template"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                  placeholder="Brief description of the template"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Total Marks</Label>
                  <Input
                    type="number"
                    value={newTemplate.total_marks}
                    onChange={(e) => setNewTemplate({ ...newTemplate, total_marks: parseInt(e.target.value) })}
                  />
                </div>

                <div>
                  <Label>Instructions</Label>
                  <Input
                    value={newTemplate.instructions}
                    onChange={(e) => setNewTemplate({ ...newTemplate, instructions: e.target.value })}
                    placeholder="Exam instructions"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Sections</h3>
                <Button type="button" variant="outline" size="sm" onClick={addSection}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Section
                </Button>
              </div>

              {newTemplate.sections.map((section, index) => (
                <Card key={index}>
                  <CardHeader>
                    <CardTitle className="text-base">{section.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>Objective Questions</Label>
                        <Input
                          type="number"
                          value={section.objectiveCount}
                          onChange={(e) => updateSection(index, "objectiveCount", parseInt(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label>Descriptive Questions</Label>
                        <Input
                          type="number"
                          value={section.descriptiveCount}
                          onChange={(e) => updateSection(index, "descriptiveCount", parseInt(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label>Marks/Question</Label>
                        <Input
                          type="number"
                          value={section.marksPerQuestion}
                          onChange={(e) => updateSection(index, "marksPerQuestion", parseInt(e.target.value))}
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Difficulty Distribution</Label>
                      <div className="grid grid-cols-3 gap-4 mt-2">
                        <div>
                          <Label className="text-xs">Easy</Label>
                          <Input
                            type="number"
                            value={section.difficulty.easy}
                            onChange={(e) => updateSection(index, "difficulty", {
                              ...section.difficulty,
                              easy: parseInt(e.target.value)
                            })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Medium</Label>
                          <Input
                            type="number"
                            value={section.difficulty.medium}
                            onChange={(e) => updateSection(index, "difficulty", {
                              ...section.difficulty,
                              medium: parseInt(e.target.value)
                            })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Hard</Label>
                          <Input
                            type="number"
                            value={section.difficulty.hard}
                            onChange={(e) => updateSection(index, "difficulty", {
                              ...section.difficulty,
                              hard: parseInt(e.target.value)
                            })}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
};

export default Templates;
