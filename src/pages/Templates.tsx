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
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

// Replace local Template type with Supabase type
type Template = Tables<"templates">;

// Local interface for section structure (mirrors Supabase JSON schema)
interface TemplateSection {
  name: string;
  objectiveCount: number;
  descriptiveCount: number;
  marksPerQuestion: number;
  difficulty: { easy: number; medium: number; hard: number };
  questions: any[];
  typePattern: string;
}

const Templates = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
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
        marksPerQuestion: 2, // Part A fixed 2 marks questions
        difficulty: { easy: 5, medium: 3, hard: 2 },
        questions: [],
        typePattern: 'OBJECTIVE_ALL'
      },
    ] as TemplateSection[],
  });

  // State for uploaded file
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // State for preview lines
  const [previewLines, setPreviewLines] = useState<string[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Preview the uploaded file (basic for txt/csv, placeholder for docx)
  const handleFilePreview = async () => {
    if (!uploadedFile) return;
    setIsUploading(true);
    try {
      const name = uploadedFile.name.toLowerCase();
      if (name.endsWith('.txt') || name.endsWith('.csv')) {
        const text = await uploadedFile.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '').slice(0, 50);
        setPreviewLines(lines.length ? lines : ['(File is empty)']);
      } else if (name.endsWith('.docx')) {
        // DOCX parsing requires an external lib like mammoth; not installed yet.
        // Provide graceful message instead of crashing.
        setPreviewLines([
          'DOCX preview not supported in browser yet.',
          'You can still upload and save the template.',
        ]);
      } else {
        setPreviewLines(['Unsupported file type for preview']);
      }
    } catch (err) {
      setPreviewLines(['Failed to read file for preview']);
    } finally {
      setIsUploading(false);
    }
  };

  const addSection = () => {
    const idx = newTemplate.sections.length;
    const sectionName = `Section ${String.fromCharCode(65 + idx)}`;
    const isPartA = idx === 0 || sectionName.toLowerCase().includes('a');
    const defaultMarks = isPartA ? 2 : 16; // Section A fixed 2, others assume 16
    setNewTemplate({
      ...newTemplate,
      sections: [
        ...newTemplate.sections,
        {
          name: sectionName,
          objectiveCount: 0,
          descriptiveCount: 0,
          marksPerQuestion: defaultMarks,
          difficulty: { easy: 0, medium: 0, hard: 0 },
          questions: [],
          typePattern: 'OBJECTIVE_ALL'
        },
      ],
    });
  };

  const updateSection = (index: number, field: keyof TemplateSection, value: any) => {
    const updatedSections = [...newTemplate.sections];
    updatedSections[index] = { ...updatedSections[index], [field]: value };
    setNewTemplate({ ...newTemplate, sections: updatedSections });
  };

  // Fetch templates from Supabase
  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error", description: "Failed to fetch templates", variant: "destructive" });
      return;
    }
    setTemplates(data || []);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Create template in Supabase
  const createTemplate = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Error", description: "You must be logged in to create a template", variant: "destructive" });
        return;
      }
      const sectionsForSave = newTemplate.sections.map(s => ({
        name: s.name,
        difficulty: s.difficulty,
        marksPerQuestion: s.marksPerQuestion,
        questions: s.questions,
        objectiveCount: s.questions.filter(q => q.type === 'objective').length,
        descriptiveCount: s.questions.filter(q => q.type === 'descriptive').length,
        typePattern: s.typePattern,
      }));
      const { error } = await supabase.from("templates").insert([
        {
          name: newTemplate.name,
          description: newTemplate.description,
          total_marks: newTemplate.total_marks,
          instructions: newTemplate.instructions,
          sections: sectionsForSave, // as JSON
          user_id: user.id,
        },
      ]);
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
            marksPerQuestion: 2,
            difficulty: { easy: 5, medium: 3, hard: 2 },
            questions: [],
            typePattern: 'OBJECTIVE_ALL',
          },
        ],
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create template", variant: "destructive" });
    }
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
                  {/* Edit button removed as requested */}
                  {/* Edit Template Dialog */}
                  <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Edit Template</DialogTitle>
                      </DialogHeader>
                      {editTemplate && (
                        <div className="space-y-6">
                          <div className="grid gap-4">
                            <div>
                              <Label>Template Name</Label>
                              <Input
                                value={editTemplate.name}
                                onChange={e => setEditTemplate({ ...editTemplate, name: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>Description</Label>
                              <Textarea
                                value={editTemplate.description}
                                onChange={e => setEditTemplate({ ...editTemplate, description: e.target.value })}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Total Marks</Label>
                                <Input
                                  type="number"
                                  value={editTemplate.total_marks}
                                  onChange={e => setEditTemplate({ ...editTemplate, total_marks: parseInt(e.target.value) })}
                                />
                              </div>
                              <div>
                                <Label>Instructions</Label>
                                <Input
                                  value={editTemplate.instructions}
                                  onChange={e => setEditTemplate({ ...editTemplate, instructions: e.target.value })}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold">Sections</h3>
                            </div>
                            {editTemplate.sections && editTemplate.sections.map((section: any, index: number) => (
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
                                        onChange={e => {
                                          const updated = [...editTemplate.sections];
                                          updated[index] = { ...updated[index], objectiveCount: parseInt(e.target.value) };
                                          setEditTemplate({ ...editTemplate, sections: updated });
                                        }}
                                      />
                                    </div>
                                    <div>
                                      <Label>Descriptive Questions</Label>
                                      <Input
                                        type="number"
                                        value={section.descriptiveCount}
                                        onChange={e => {
                                          const updated = [...editTemplate.sections];
                                          updated[index] = { ...updated[index], descriptiveCount: parseInt(e.target.value) };
                                          setEditTemplate({ ...editTemplate, sections: updated });
                                        }}
                                      />
                                    </div>
                                    <div>
                                      <Label>Marks/Question</Label>
                                      <Input
                                        type="number"
                                        value={section.marksPerQuestion}
                                        onChange={e => {
                                          const updated = [...editTemplate.sections];
                                          updated[index] = { ...updated[index], marksPerQuestion: parseInt(e.target.value) };
                                          setEditTemplate({ ...editTemplate, sections: updated });
                                        }}
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
                                          onChange={e => {
                                            const updated = [...editTemplate.sections];
                                            updated[index] = {
                                              ...updated[index],
                                              difficulty: { ...updated[index].difficulty, easy: parseInt(e.target.value) }
                                            };
                                            setEditTemplate({ ...editTemplate, sections: updated });
                                          }}
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Medium</Label>
                                        <Input
                                          type="number"
                                          value={section.difficulty.medium}
                                          onChange={e => {
                                            const updated = [...editTemplate.sections];
                                            updated[index] = {
                                              ...updated[index],
                                              difficulty: { ...updated[index].difficulty, medium: parseInt(e.target.value) }
                                            };
                                            setEditTemplate({ ...editTemplate, sections: updated });
                                          }}
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Hard</Label>
                                        <Input
                                          type="number"
                                          value={section.difficulty.hard}
                                          onChange={e => {
                                            const updated = [...editTemplate.sections];
                                            updated[index] = {
                                              ...updated[index],
                                              difficulty: { ...updated[index].difficulty, hard: parseInt(e.target.value) }
                                            };
                                            setEditTemplate({ ...editTemplate, sections: updated });
                                          }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                        <Button
                          onClick={async () => {
                            if (!editTemplate) return;
                            try {
                              const sectionsForSave = editTemplate.sections.map(s => ({
                                name: s.name,
                                difficulty: s.difficulty,
                                marksPerQuestion: s.marksPerQuestion,
                                questions: s.questions,
                                objectiveCount: s.questions.filter(q => q.type === 'objective').length,
                                descriptiveCount: s.questions.filter(q => q.type === 'descriptive').length,
                                typePattern: s.typePattern,
                              }));
                              const { error } = await supabase.from("templates").update({
                                name: editTemplate.name,
                                description: editTemplate.description,
                                total_marks: editTemplate.total_marks,
                                instructions: editTemplate.instructions,
                                sections: sectionsForSave,
                              }).eq('id', editTemplate.id);
                              if (error) throw error;
                              toast({ title: "Success", description: "Template updated successfully" });
                              setIsEditDialogOpen(false);
                              setEditTemplate(null);
                              fetchTemplates();
                            } catch (error) {
                              toast({ title: "Error", description: "Failed to update template", variant: "destructive" });
                            }
                          }}
                        >Save Changes</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
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
              {/* File Upload for Word/Excel */}

              <div>
                <Label>Upload Template File (CSV, DOCX, TXT)</Label>
                <Input
                  type="file"
                  accept=".csv,.docx,.txt"
                  onChange={e => {
                    setUploadedFile(e.target.files?.[0] || null);
                    setPreviewLines(null);
                  }}
                />
                {uploadedFile && (
                  <div className="text-xs text-muted-foreground mt-1">Selected: {uploadedFile.name}</div>
                )}
                {uploadedFile && (
                  <Button className="mt-2" size="sm" onClick={handleFilePreview} disabled={isUploading}>
                    {isUploading ? "Extracting..." : "Preview Document"}
                  </Button>
                )}
                {previewLines && previewLines.length > 0 && (
                  <div className="mt-4 p-2 border rounded bg-gray-50 max-h-48 overflow-y-auto">
                    <div className="font-semibold mb-1">Document Preview:</div>
                    <ul className="text-xs space-y-1">
                      {previewLines.map((line, idx) => (
                        <li key={idx}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

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
                              // add new empty questions
                              const defaultMarks = section.name.toLowerCase().includes('section a') ? 2 : section.marksPerQuestion || 16;
                              const toAdd = Array.from({ length: count - existing.length }, () => ({
                                type: 'objective' as const,
                                co: 'CO1',
                                btl: 'random',
                                marks: defaultMarks,
                                isOr: false
                              }));
                              updatedSections[sIdx].questions = [...existing, ...toAdd];
                            } else {
                              updatedSections[sIdx].questions = existing.slice(0, count);
                            }
                            // Reapply pattern after resizing
                            const pattern = updatedSections[sIdx].typePattern;
                            if (pattern) {
                              updatedSections[sIdx].questions = updatedSections[sIdx].questions.map((q, idx) => {
                                const number = idx + 1;
                                let newType: 'objective' | 'descriptive' = q.type;
                                switch (pattern) {
                                  case 'OBJECTIVE_ALL': newType = 'objective'; break;
                                  case 'DESCRIPTIVE_ALL': newType = 'descriptive'; break;
                                  case 'ODD_OBJECTIVE_EVEN_DESCRIPTIVE': newType = number % 2 === 1 ? 'objective' : 'descriptive'; break;
                                  case 'ODD_DESCRIPTIVE_EVEN_OBJECTIVE': newType = number % 2 === 1 ? 'descriptive' : 'objective'; break;
                                }
                                return { ...q, type: newType };
                              });
                            }
                            // update counts
                            updatedSections[sIdx].objectiveCount = updatedSections[sIdx].questions.filter(q => q.type === 'objective').length;
                            updatedSections[sIdx].descriptiveCount = updatedSections[sIdx].questions.filter(q => q.type === 'descriptive').length;
                            setNewTemplate({ ...newTemplate, sections: updatedSections });
                          }}
                        />
                        <select
                          className="h-8 text-xs border rounded px-2 bg-background"
                          value={section.typePattern}
                          onChange={(e) => {
                            const pattern = e.target.value;
                            const updatedSections = [...newTemplate.sections];
                            updatedSections[sIdx].typePattern = pattern;
                            updatedSections[sIdx].questions = updatedSections[sIdx].questions.map((q, idx) => {
                              const number = idx + 1;
                              let newType: 'objective' | 'descriptive' = q.type;
                              switch (pattern) {
                                case 'OBJECTIVE_ALL': newType = 'objective'; break;
                                case 'DESCRIPTIVE_ALL': newType = 'descriptive'; break;
                                case 'ODD_OBJECTIVE_EVEN_DESCRIPTIVE': newType = number % 2 === 1 ? 'objective' : 'descriptive'; break;
                                case 'ODD_DESCRIPTIVE_EVEN_OBJECTIVE': newType = number % 2 === 1 ? 'descriptive' : 'objective'; break;
                              }
                              return { ...q, type: newType };
                            });
                            updatedSections[sIdx].objectiveCount = updatedSections[sIdx].questions.filter(q => q.type === 'objective').length;
                            updatedSections[sIdx].descriptiveCount = updatedSections[sIdx].questions.filter(q => q.type === 'descriptive').length;
                            setNewTemplate({ ...newTemplate, sections: updatedSections });
                          }}
                        >
                          <option value="OBJECTIVE_ALL">Objective</option>
                          <option value="DESCRIPTIVE_ALL">Descriptive</option>
                          <option value="ODD_OBJECTIVE_EVEN_DESCRIPTIVE">Odd Objective / Even Descriptive</option>
                          <option value="ODD_DESCRIPTIVE_EVEN_OBJECTIVE">Odd Descriptive / Even Objective</option>
                        </select>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {section.questions.length === 0 && (
                      <p className="text-xs text-muted-foreground">Set number of questions to begin.</p>
                    )}
                    {section.questions.map((q, qIdx) => (
                      <div key={qIdx} className="border rounded p-3 space-y-2">
                        <div className="grid grid-cols-7 gap-2 items-start">
                          <div>
                            <Label className="text-xs">Type</Label>
                            <select
                              className="w-full text-sm border rounded h-8 px-2 bg-background"
                              value={q.type}
                              onChange={(e) => {
                                // If a pattern is active, manual changes are still allowed but will be overridden if pattern changes again.
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
                            {section.name.toLowerCase().includes('section a') ? (
                              <Input
                                disabled
                                value={2}
                                className="h-8 text-sm"
                              />
                            ) : (
                              <select
                                className="w-full text-sm border rounded h-8 px-2 bg-background"
                                value={q.marks ?? (section.marksPerQuestion || 16)}
                                onChange={(e) => {
                                  const updatedSections = [...newTemplate.sections];
                                  updatedSections[sIdx].questions[qIdx].marks = parseInt(e.target.value) || 16;
                                  setNewTemplate({ ...newTemplate, sections: updatedSections });
                                }}
                              >
                                <option value={8}>8</option>
                                <option value={16}>16</option>
                              </select>
                            )}
                          </div>
                          <div>
                            <Label className="text-xs">OR</Label>
                            <div className="flex items-center h-8">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                disabled={qIdx === 0}
                                checked={!!q.isOr}
                                onChange={(e) => {
                                  const updatedSections = [...newTemplate.sections];
                                  const prev = updatedSections[sIdx].questions[qIdx - 1];
                                  if (e.target.checked) {
                                    // Validate previous question exists and is not already an OR option.
                                    if (qIdx === 0) {
                                      toast({ title: "Not Allowed", description: "First question cannot be marked OR", variant: "destructive" });
                                      return;
                                    }
                                    if (prev?.isOr) {
                                      toast({ title: "Invalid", description: "Consecutive OR options not allowed", variant: "destructive" });
                                      return;
                                    }
                                    updatedSections[sIdx].questions[qIdx].isOr = true;
                                  } else {
                                    updatedSections[sIdx].questions[qIdx].isOr = false;
                                  }
                                  setNewTemplate({ ...newTemplate, sections: updatedSections });
                                }}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground">{qIdx === 0 ? 'Base question' : 'Alternate to previous'}</p>
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
