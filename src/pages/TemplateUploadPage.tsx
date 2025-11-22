import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Upload } from "lucide-react";

const TemplateUploadPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploaded, setUploaded] = useState(false);
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setProgress(0);
      setUploaded(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setProgress(30);
    // Dummy upload logic
    setTimeout(() => {
      setProgress(100);
      setUploaded(true);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Card className="w-full max-w-xl p-8 flex flex-col items-center animate-fade-in">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold mb-2">Upload a Template</CardTitle>
          <CardDescription>Upload a CSV, DOCX, or TXT file to automatically generate questions for your form.</CardDescription>
        </CardHeader>
        <CardContent className="w-full flex flex-col items-center">
          <label htmlFor="template-upload" className="w-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:bg-gray-50 transition mb-4">
            <Upload className="w-10 h-10 text-primary mb-2" />
            <span className="text-lg font-medium">Drag & Drop or Click to Upload</span>
            <span className="text-sm text-gray-500 mt-1">Supported: .csv, .docx, .txt</span>
            <Input id="template-upload" type="file" accept=".csv,.docx,.txt" className="hidden" onChange={handleFileChange} />
          </label>
          {file && (
            <div className="w-full text-center mb-2">
              <span className="text-sm text-gray-700">Selected: {file.name}</span>
            </div>
          )}
          {progress > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
              <div className="bg-primary h-2.5 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
            </div>
          )}
          <Button className="w-full mt-2" size="lg" onClick={handleUpload} disabled={!file || uploaded}>
            Upload
          </Button>
          {uploaded && (
            <Button className="w-full mt-4 animate-bounce" size="lg" variant="outline" onClick={() => navigate("/review-template")}>Scan Template</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TemplateUploadPage;
