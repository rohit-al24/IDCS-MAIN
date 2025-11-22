import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

interface TemplateSection {
  name: string;
  objectiveCount: number;
  descriptiveCount: number;
  marksPerQuestion: number;
  difficulty: { easy: number; medium: number; hard: number };
}

type Template = Tables<"templates">;

const EditTemplate = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchTemplate = async () => {
      setLoading(true);
      const { data } = await supabase.from("templates").select("*").eq("id", id).single();
      setTemplate(data || null);
      setLoading(false);
    };
    if (id) fetchTemplate();
  }, [id]);

  const updateSection = (index: number, field: keyof TemplateSection, value: any) => {
    if (!template) return;
    const updatedSections = [...(template.sections as any[])];
    updatedSections[index] = { ...updatedSections[index], [field]: value };
    setTemplate({ ...template, sections: updatedSections } as Template);
  };

  const updateDifficulty = (index: number, diffField: "easy" | "medium" | "hard", value: number) => {
    if (!template) return;
    const updatedSections = [...(template.sections as any[])];
    updatedSections[index] = {
      ...updatedSections[index],
      difficulty: { ...updatedSections[index].difficulty, [diffField]: value },
    };
    setTemplate({ ...template, sections: updatedSections } as Template);
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    const { error } = await supabase
      .from("templates")
      .update({
        name: template.name,
        description: template.description,
        total_marks: template.total_marks,
        instructions: template.instructions,
        sections: template.sections as any,
      })
      .eq("id", template.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "Failed to update template", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Template updated successfully" });
      navigate("/templates");
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!template) return <div className="p-8 text-center">Template not found.</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/templates")}>Back</Button>
          <h1 className="text-2xl font-bold text-primary">Edit Template</h1>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Edit Template Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label>Template Name</Label>
              <Input value={template.name} onChange={e => setTemplate({ ...template, name: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={template.description} onChange={e => setTemplate({ ...template, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Total Marks</Label>
                <Input type="number" value={template.total_marks} onChange={e => setTemplate({ ...template, total_marks: parseInt(e.target.value) })} />
              </div>
              <div>
                <Label>Instructions</Label>
                <Input value={template.instructions} onChange={e => setTemplate({ ...template, instructions: e.target.value })} />
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold">Sections</h3>
              {(template.sections as any[]).map((section, idx) => (
                <Card key={idx} className="mb-2">
                  <CardHeader>
                    <CardTitle className="text-base">{section.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>Objective Questions</Label>
                        <Input type="number" value={section.objectiveCount} onChange={e => updateSection(idx, "objectiveCount", parseInt(e.target.value))} />
                      </div>
                      <div>
                        <Label>Descriptive Questions</Label>
                        <Input type="number" value={section.descriptiveCount} onChange={e => updateSection(idx, "descriptiveCount", parseInt(e.target.value))} />
                      </div>
                      <div>
                        <Label>Marks/Question</Label>
                        <Input type="number" value={section.marksPerQuestion} onChange={e => updateSection(idx, "marksPerQuestion", parseInt(e.target.value))} />
                      </div>
                    </div>
                    <div>
                      <Label>Difficulty Distribution</Label>
                      <div className="grid grid-cols-3 gap-4 mt-2">
                        <div>
                          <Label className="text-xs">Easy</Label>
                          <Input type="number" value={section.difficulty.easy} onChange={e => updateDifficulty(idx, "easy", parseInt(e.target.value))} />
                        </div>
                        <div>
                          <Label className="text-xs">Medium</Label>
                          <Input type="number" value={section.difficulty.medium} onChange={e => updateDifficulty(idx, "medium", parseInt(e.target.value))} />
                        </div>
                        <div>
                          <Label className="text-xs">Hard</Label>
                          <Input type="number" value={section.difficulty.hard} onChange={e => updateDifficulty(idx, "hard", parseInt(e.target.value))} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default EditTemplate;
