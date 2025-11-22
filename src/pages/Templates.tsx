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
  difficulty: { easy: number; medium: number; hard: number };
}

const Templates = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
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
      },
    ] as TemplateSection[],
  });

  // State for uploaded file
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("templates")
        .select("*")
        .eq("user_id", user.id);

      setTemplates(data || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to fetch templates", variant: "destructive" });
    }
  };

  // State for preview lines
  const [previewLines, setPreviewLines] = useState<string[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFilePreview = async () => {
    if (!uploadedFile) return;
    setIsUploading(true);
    setPreviewLines(null);
    const formData = new FormData();
    formData.append("file", uploadedFile);
    try {
      const res = await fetch("http://localhost:4000/api/template/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.lines) {
        setPreviewLines(data.lines);
        toast({ title: "Preview Ready", description: "Document content extracted." });
      } else {
        toast({ title: "Error", description: "Could not extract document content.", variant: "destructive" });
      }
    } catch (err) {
      console.error("Failed to connect to backend:", err);
      toast({ title: "Error", description: "Failed to connect to backend. Check if the Python server is running on port 4000.", variant: "destructive" });
    }
    setIsUploading(false);
  };

  const createTemplate = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Error", description: "Please login first", variant: "destructive" });
        return;
      }
      // No file upload to bucket, just save template info
      const { error } = await supabase.from("templates").insert([{
        user_id: user.id,
        name: newTemplate.name,
        description: newTemplate.description,
        total_marks: newTemplate.total_marks,
        instructions: newTemplate.instructions,
        sections: newTemplate.sections as any,
      }]);
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
      setUploadedFile(null);
      setPreviewLines(null);
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
