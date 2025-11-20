import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUp, FileText, Wand2, CheckCircle, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Dashboard = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">KR Question Generator</h1>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12">
        <h2 className="text-4xl font-bold mb-8">Dashboard</h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/upload")}>
            <CardHeader>
              <FileUp className="w-12 h-12 text-primary mb-2" />
              <CardTitle>Upload Questions</CardTitle>
              <CardDescription>Import your question bank</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Upload CSV, Excel, PDF, or TXT files</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/verify")}>
            <CardHeader>
              <CheckCircle className="w-12 h-12 text-accent mb-2" />
              <CardTitle>Verify Questions</CardTitle>
              <CardDescription>Review and approve questions</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Validate and tag your questions</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/templates")}>
            <CardHeader>
              <FileText className="w-12 h-12 text-secondary mb-2" />
              <CardTitle>Templates</CardTitle>
              <CardDescription>Manage exam templates</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Create and edit templates</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/generate")}>
            <CardHeader>
              <Wand2 className="w-12 h-12 text-warning mb-2" />
              <CardTitle>Generate Paper</CardTitle>
              <CardDescription>Auto-generate exams</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Create question papers instantly</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
