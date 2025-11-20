import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileUp, FileText, Wand2, Shield } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">KR Question Generator</h1>
          <Button onClick={() => navigate("/login")}>Login</Button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Generate Question Papers Automatically
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Upload your question bank, select a template, and generate complete exam papers with answer keys in seconds.
          </p>
          <Button size="lg" onClick={() => navigate("/login")} className="text-lg px-8">
            Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          <div className="bg-card p-6 rounded-xl border shadow-md hover:shadow-lg transition-shadow">
            <FileUp className="w-12 h-12 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Upload Question Bank</h3>
            <p className="text-muted-foreground">Import questions from CSV, Excel, PDF, or TXT files with automatic parsing.</p>
          </div>

          <div className="bg-card p-6 rounded-xl border shadow-md hover:shadow-lg transition-shadow">
            <Shield className="w-12 h-12 text-accent mb-4" />
            <h3 className="text-xl font-semibold mb-2">Verify Questions</h3>
            <p className="text-muted-foreground">Review and validate each question with easy verification tools.</p>
          </div>

          <div className="bg-card p-6 rounded-xl border shadow-md hover:shadow-lg transition-shadow">
            <FileText className="w-12 h-12 text-secondary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Manage Templates</h3>
            <p className="text-muted-foreground">Create custom exam templates with sections, marks, and difficulty distribution.</p>
          </div>

          <div className="bg-card p-6 rounded-xl border shadow-md hover:shadow-lg transition-shadow">
            <Wand2 className="w-12 h-12 text-warning mb-4" />
            <h3 className="text-xl font-semibold mb-2">Auto Generate</h3>
            <p className="text-muted-foreground">Generate randomized question papers with answer keys instantly.</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
