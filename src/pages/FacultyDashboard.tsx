import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LogOut, Mail, User, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const FacultyDashboard = () => {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string>("");
  const [faculty, setFaculty] = useState<any>(null);
  const [collegeName, setCollegeName] = useState("");

  useEffect(() => {
    const getUserEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || "");
      }
    };
    getUserEmail();
  }, []);

  useEffect(() => {
    const fetchFacultyDetails = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("full_name, email, college_id")
          .eq("user_id", user.id)
          .single();
        setFaculty(roleData);
        if (roleData?.college_id) {
          const { data: college } = await supabase
            .from("college")
            .select("name")
            .eq("id", roleData.college_id)
            .single();
          setCollegeName(college?.name || "");
        }
      }
    };
    fetchFacultyDetails();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/");
  };

  return (
    <div className="flex flex-col items-center min-h-screen overflow-hidden">
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 w-full">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">Faculty Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{userEmail}</span>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </nav>
    <main className="container mx-auto px-4 py-12 flex-1">
      <div className="max-w-4xl">
        <h2 className="text-4xl font-bold mb-2">Welcome, {faculty && faculty.full_name ? faculty.full_name : "(no email)"}</h2>
        <p className="text-muted-foreground mb-8">
        From IQAC (IDCS) KRCT
        </p>
        <Card className="mt-8 bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">About Faculty Access</CardTitle>
          </CardHeader>
          <CardContent className="text-blue-800">
            <p>
              As a faculty member, you have access to upload your questions, verify them, and generate question papers.
              You cannot access administrative features like user management or system-wide settings.
            </p>
          </CardContent>
        </Card>
        <Card className="w-full max-w-xl mb-4 shadow-lg border border-muted rounded-2xl mt-8">
        <CardHeader className="pb-2 border-b">
          <CardTitle className="text-2xl font-bold text-primary tracking-wide flex items-center gap-2">
            <User className="w-7 h-7 text-primary" /> Faculty Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          {faculty ? (
            <div className="grid grid-cols-1 gap-6 py-6 px-2">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Full Name</div>
                <div className="text-lg font-semibold text-foreground">{faculty.full_name || "(no name)"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Email Address</div>
                <div className="text-lg font-medium text-foreground">{faculty.email || "(no email)"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">College</div>
                <div className="text-lg font-medium text-foreground">{collegeName || "(no college)"}</div>
              </div>
            </div>
            </div>
          ) : (
            <div className="text-muted-foreground py-8 text-center">Loading faculty details...</div>
          )}
        </CardContent>
        </Card>
      </div>
    </main>
      </div>
  );
};

export default FacultyDashboard;
