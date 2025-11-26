import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel, SidebarSeparator } from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { FileUp, FileText, Wand2, Shield, Home, LogIn } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import UploadQuestions from "./pages/UploadQuestions";
import VerifyQuestions from "./pages/VerifyQuestions";
import Templates from "./pages/Templates";
import GeneratePaper from "./pages/GeneratePaper";
import NotFound from "./pages/NotFound";
import TemplateUploadPage from "./pages/TemplateUploadPage";
import ManageQuestionsPage from "./pages/ManageQuestionsPage";
import TemplateQuestionReviewPage from "./pages/TemplateQuestionReviewPage";
import React, { useState } from "react";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";
import * as XLSX from "xlsx";

const queryClient = new QueryClient();

const BANNER_TEXT = "Exam Paper Banner";


function App() {
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
                  <div className="bg-primary flex items-center gap-4 px-6 py-6 rounded-b-2xl shadow-lg drop-shadow-lg">
                    <span className="text-4xl font-extrabold text-primary-foreground tracking-wide drop-shadow">IDCS KR</span>
                  </div>
                </SidebarHeader>
                <SidebarContent>
                  <SidebarGroup>
                    <SidebarGroupLabel className="text-lg font-semibold mb-4 mt-4 text-gray-500">Main</SidebarGroupLabel>
                    <SidebarMenu className="gap-1 px-2 pb-4">
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <NavLink to="/" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                            <Home className="w-5 h-5" />Home
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <NavLink to="/login" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                            <LogIn className="w-5 h-5" />Login
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <NavLink to="/dashboard" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                            <FileText className="w-5 h-5" />Dashboard
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
                          <NavLink to="/authentication" activeClassName="font-bold text-primary bg-primary/10 shadow-sm" className="flex items-center gap-3 text-lg py-2 px-4 rounded-lg transition-all hover:bg-primary/10 hover:text-primary">
                            <Shield className="w-5 h-5" />Authentication
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
                    </SidebarMenu>
                  </SidebarGroup>
                </SidebarContent>
                <SidebarSeparator />
              </Sidebar>
              <main className="flex-1 min-w-0 overflow-auto">
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/upload" element={<UploadQuestions />} />
                  <Route path="/verify" element={<VerifyQuestions />} />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="/manage-questions" element={<ManageQuestionsPage />} />
                  <Route path="/review-template" element={<TemplateQuestionReviewPage />} />
                  <Route path="/generate" element={<GeneratePaper />} />
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
