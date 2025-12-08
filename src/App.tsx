import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel, SidebarSeparator } from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import ProtectedRoute from "@/components/ProtectedRoute";
import { FileUp, FileText, Wand2, Shield, Home, LogIn } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import FacultyDashboard from "./pages/FacultyDashboard";
import UploadQuestions from "./pages/UploadQuestions";
import VerifyQuestions from "./pages/VerifyQuestions";
import Templates from "./pages/Templates";
import GeneratePaper from "./pages/GeneratePaper";
import NotFound from "./pages/NotFound";
import TemplateUploadPage from "./pages/TemplateUploadPage";
import ManageQuestionsPage from "./pages/ManageQuestionsPage";
import TemplateQuestionReviewPage from "./pages/TemplateQuestionReviewPage";
import React, { useState, useEffect } from "react";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";
import * as XLSX from "xlsx";
import SplashOverlay from "./components/SplashOverlay";
import { supabase } from "@/integrations/supabase/client";
import Authentication from "./pages/Authentication";
import VerifyQuestionsBank from "./pages/VerifyQuestionsBank";
import VerifyQuestionsFacultyOpen from "./pages/VerifyQuestionsFacultyOpen";

const queryClient = new QueryClient();

const BANNER_TEXT = "Exam Paper Banner";

function App() {
    // Logout handler
    const handleLogout = async () => {
      await supabase.auth.signOut();
      window.location.href = "/login";
    };
  // Splash screen state (overlay will call onDone)
  const [showSplash, setShowSplash] = useState(true);
  const [userRole, setUserRole] = useState<"admin" | "faculty" | null>(null);
  
  // Splash overlay will control when it's done and call onDone

  // Check user role on mount
  useEffect(() => {
    const checkUserRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (user) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();
        console.log('[App] fetched user role', { userId: user.id, roleData });
        if (roleData) setUserRole(roleData.role);
      }
    };

    checkUserRole();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SidebarProvider>
            <div className="flex min-h-screen w-full">
              <Sidebar side="left" collapsible="offcanvas">
                <SidebarHeader>
                  <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(90deg, #e7f7ec 0%, #f3efe6 100%)', borderBottom: '1px solid rgba(34,34,34,0.06)' }}>
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-primary/10 p-2">
                        {/* Logo SVG */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12l2 2 4-4" />
                        </svg>
                      </div>
                      <div className="leading-tight">
                        <div className="text-sm font-semibold text-primary-700">IDCS KR</div>
                        <div className="text-xs text-primary-500">Examination Management</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleLogout}
                        title="Logout"
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/70 border border-gray-200 rounded-md text-sm text-primary-700 hover:bg-primary/10 hover:border-primary/20 transition"
                      >
                        {/* Minimal logout icon with subtle color */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8v8" />
                        </svg>
                        Logout
                      </button>
                    </div>
                  </div>
                </SidebarHeader>
                <SidebarContent>
                  <SidebarGroup>
                    <SidebarGroupLabel className="text-lg font-semibold mb-4 mt-4 text-gray-500">Main</SidebarGroupLabel>
                    <SidebarMenu className="gap-1 px-2 pb-4">
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <NavLink to="/login" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                            <LogIn className="w-5 h-5" />Login
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {userRole === "admin" && (
                        <>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                              <NavLink to="/" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                                <Home className="w-5 h-5" />Home
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                              <NavLink to="/upload" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                                <FileUp className="w-5 h-5" />Upload
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                              <NavLink to="/verify" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                                <Shield className="w-5 h-5" />Verify
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                              <NavLink to="/templates" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                                <FileText className="w-5 h-5" />Templates
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                              <NavLink to="/manage-questions" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                                <FileUp className="w-5 h-5" />Manage Questions
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                              <NavLink to="/auth" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20h6M3 20h5v-2a4 4 0 00-3-3.87M16 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                Authentication
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                              <NavLink to="/generate" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                                <Wand2 className="w-5 h-5" />Generate
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </>
                      )}
                      {userRole === "faculty" && (
                        <>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                              <NavLink to="/faculty-dashboard" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                                <FileText className="w-5 h-5" />Faculty Dashboard
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                              <SidebarMenuItem>
                                <SidebarMenuButton asChild>
                                  <NavLink to="/verify-faculty-open" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                                    <Shield className="w-5 h-5" />Verify Questions
                                  </NavLink>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                        </>
                      )}
                    </SidebarMenu>
                  </SidebarGroup>
                </SidebarContent>
                <SidebarSeparator />
              </Sidebar>
              <main className="flex-1 min-w-0 overflow-auto">
                {/* Splash overlay rendered on top */}
                {showSplash && (
                  <div className="fixed inset-0 z-[9999] bg-white">
                    <SplashOverlay videoSrc="/intro.mp4" onDone={() => setShowSplash(false)} />
                  </div>
                )}

                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/dashboard" element={<ProtectedRoute requiredRole="admin"><Dashboard /></ProtectedRoute>} />
                  <Route path="/faculty-dashboard" element={<ProtectedRoute requiredRole="faculty"><FacultyDashboard /></ProtectedRoute>} />
                  <Route path="/upload" element={<ProtectedRoute><UploadQuestions /></ProtectedRoute>} />
                  
                    <Route path="/verify" element={<ProtectedRoute requiredRole="admin"><VerifyQuestions /></ProtectedRoute>} />
                    <Route path="/faculty/verify/:bankId" element={<ProtectedRoute requiredRole="faculty"><VerifyQuestionsBank /></ProtectedRoute>} />
                  <Route path="/verify" element={<ProtectedRoute authOnly><VerifyQuestions /></ProtectedRoute>} />
                  <Route path="/verify-faculty-open" element={<VerifyQuestionsFacultyOpen />} />
                  <Route path="/templates" element={<ProtectedRoute requiredRole="admin"><Templates /></ProtectedRoute>} />
                  <Route path="/manage-questions" element={<ProtectedRoute requiredRole="admin"><ManageQuestionsPage /></ProtectedRoute>} />
                  <Route path="/review-template" element={<ProtectedRoute requiredRole="admin"><TemplateQuestionReviewPage /></ProtectedRoute>} />
                  <Route path="/generate" element={<ProtectedRoute><GeneratePaper /></ProtectedRoute>} />
                  <Route path="/auth" element={<ProtectedRoute requiredRole="admin"><Authentication /></ProtectedRoute>} />
                  <Route path="/faculty/verify/:bankId" element={<ProtectedRoute requiredRole="faculty"><VerifyQuestionsBank /></ProtectedRoute>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
            </div>
          </SidebarProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
