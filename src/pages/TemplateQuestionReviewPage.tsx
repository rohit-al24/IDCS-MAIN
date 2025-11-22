import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, FileText, ScanLine, CheckCircle2 } from "lucide-react";

const dummyQuestions = [
  { text: "What is your name?", type: "Short Answer" },
  { text: "Describe your experience.", type: "Paragraph" },
  { text: "Which colors do you like?", type: "Multiple Choice", options: ["Red", "Blue", "Green"] },
];

const questionTypes = ["Short Answer", "Paragraph", "Multiple Choice"];

const TemplateQuestionReviewPage = () => {
  const [questions, setQuestions] = useState(dummyQuestions);
  const navigate = useNavigate();

  const handleTypeChange = (idx: number, type: string) => {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, type } : q));
  };

  const handleDelete = (idx: number) => {
    setQuestions(qs => qs.filter((_, i) => i !== idx));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Card className="w-full max-w-2xl p-8 animate-fade-in">
        <CardHeader className="flex flex-col items-center">
          <ScanLine className="w-10 h-10 text-primary mb-2 animate-pulse" />
          <CardTitle className="text-2xl font-bold mb-2">Review Extracted Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {questions.map((q, idx) => (
              <li key={idx} className="flex items-center gap-4 p-4 border rounded-lg bg-gray-50">
                <FileText className="w-6 h-6 text-gray-400" />
                <div className="flex-1">
                  <div className="font-medium mb-1">{q.text}</div>
                  <Select value={q.type} onValueChange={val => handleTypeChange(idx, val)}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {questionTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {q.options && (
                    <div className="text-xs text-gray-500 mt-1">Options: {q.options.join(", ")}</div>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(idx)}>
                  <Trash2 className="w-5 h-5 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
          <Button className="w-full mt-8" size="lg" onClick={() => navigate("/form-builder")}> <CheckCircle2 className="w-5 h-5 mr-2" /> Add to Form</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default TemplateQuestionReviewPage;
