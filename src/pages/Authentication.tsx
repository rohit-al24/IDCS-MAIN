import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Authentication = () => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("KRCT@2024");
  const [loading, setLoading] = useState(false);
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');
  const [showPassword, setShowPassword] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [collegeCode, setCollegeCode] = useState("");
  const [collegeName, setCollegeName] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [collegeSuggestions, setCollegeSuggestions] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchFaculty = async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, full_name, email")
        .eq("role", "faculty");
      if (!error && data) {
        setFacultyList(data);
      }
    };
    fetchFaculty();
  }, [loading]);

  // Autocomplete for college code
  useEffect(() => {
    const fetchCollegeSuggestions = async () => {
      if (collegeCode.length > 0) {
        const { data } = await supabase
          .from("college")
          .select("id, code, name")
          .ilike("code", `%${collegeCode}%`);
        setCollegeSuggestions(data || []);
      } else {
        setCollegeSuggestions([]);
      }
    };
    fetchCollegeSuggestions();
  }, [collegeCode]);

  // Autocomplete for college name
  useEffect(() => {
    const fetchCollegeSuggestionsByName = async () => {
      if (collegeName.length > 0) {
        const { data } = await supabase
          .from("college")
          .select("id, code, name")
          .ilike("name", `%${collegeName}%`);
        setCollegeSuggestions(data || []);
      }
    };
    fetchCollegeSuggestionsByName();
  }, [collegeName]);

  const handleCreateFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Create user in Supabase auth
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      // Insert role, full name, email, and college_id in user_roles table
      if (data.user?.id) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({
            user_id: data.user.id,
            role: "faculty",
            full_name: fullName,
            email: email,
            college_id: collegeId
          });
        if (roleError) throw roleError;
        toast.success("Faculty user created successfully!");
        setFullName("");
        setEmail("");
        setPassword("KRCT@2024");
        setCollegeCode("");
        setCollegeName("");
        setCollegeId("");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  const filteredFaculty = facultyList.filter(
    (f) =>
      (f.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (f.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (!error) {
      toast.success("User deleted");
      setSelectedUser(null);
      setLoading((l) => !l); // trigger reload
    } else {
      toast.error("Failed to delete user");
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setCollegeSuggestions([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Sub sidebar */}
      <div className="w-48 bg-muted/20 border-r flex flex-col py-8">
        <div className="px-6 pb-4 text-lg font-bold text-primary">Authentication</div>
        <button
          className={`px-6 py-3 text-left w-full font-medium rounded-r-lg transition-all ${activeTab === 'create' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/10'}`}
          onClick={() => setActiveTab('create')}
        >
          Create
        </button>
        <button
          className={`px-6 py-3 text-left w-full font-medium rounded-r-lg transition-all ${activeTab === 'manage' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/10'}`}
          onClick={() => setActiveTab('manage')}
        >
          Manage
        </button>
      </div>
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {activeTab === 'create' && (
          <Card className="w-full max-w-md mb-8">
            <CardHeader>
              <CardTitle>Create Faculty User</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateFaculty} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="pt-2 pb-2 border-t mt-2 mb-2">
                  <div className="font-semibold mb-2">College</div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="relative space-y-2" ref={dropdownRef}>
                      <Label htmlFor="collegeCode">Code</Label>
                      <Input
                        id="collegeCode"
                        type="text"
                        value={collegeCode}
                        onChange={(e) => {
                          setCollegeCode(e.target.value);
                          setCollegeId("");
                          setCollegeName("");
                        }}
                        required
                        placeholder="Type or select College Code"
                        autoComplete="off"
                      />
                      {collegeSuggestions.length > 0 && (
                        <ul className="absolute left-0 right-0 bg-white border rounded shadow z-10 mt-1 max-h-40 overflow-auto">
                          {collegeSuggestions.map((c) => (
                            <li
                              key={c.id}
                              className="px-3 py-2 cursor-pointer hover:bg-primary/10 whitespace-normal"
                              onClick={() => {
                                setCollegeCode(c.code);
                                setCollegeName(c.name);
                                setCollegeId(c.id);
                                setCollegeSuggestions([]);
                              }}
                            >
                              <span className="font-semibold">{c.code}</span> - {c.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="collegeName">Name</Label>
                      <Input
                        id="collegeName"
                        type="text"
                        value={collegeName}
                        onChange={(e) => {
                          setCollegeName(e.target.value);
                          setCollegeId("");
                          setCollegeCode("");
                        }}
                        required
                        placeholder="Type or select College Name"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="KRCT@2024"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-2 text-xs text-primary underline"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full mt-4" disabled={loading}>
                  {loading ? "Creating..." : "Create Faculty User"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
        {activeTab === 'manage' && (
          <div className="w-full max-w-2xl mx-auto">
            <div className="mb-4">
              <Input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
              />
            </div>
            {!selectedUser ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredFaculty.length === 0 ? (
                  <div className="text-muted-foreground">No faculty users found.</div>
                ) : (
                  filteredFaculty.map((f) => (
                    <Card key={f.user_id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setSelectedUser(f)}>
                      <CardHeader>
                        <CardTitle>{f.full_name || "(no name)"}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm text-muted-foreground">{f.email || "(no email)"}</div>
                        {/* Question Bank Assignment Preview (admin manage list) */}
                        <QuestionBankAssignmentPreview userId={f.user_id} />
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            ) : (
              <Card className="w-full">
                <CardHeader>
                  <CardTitle>{selectedUser.full_name || "(no name)"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-2 text-muted-foreground">{selectedUser.email || "(no email)"}</div>
                  <div className="mb-4">
                  <QuestionBankAssignment userId={selectedUser.user_id} />
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="destructive" onClick={() => handleDeleteUser(selectedUser.user_id)}>
                    Delete User
                  </Button>
                  <Button variant="outline" onClick={() => toast.info("Access granted (demo)")}>Give Access</Button>
                  <Button variant="secondary" onClick={() => setSelectedUser(null)}>Back</Button>
                </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Authentication;

// --- Question Bank Assignment Components ---

type QuestionBank = { id: string; question_text: string };

function QuestionBankAssignmentPreview({ userId }: { userId: string }) {
  const [assignedTitles, setAssignedTitles] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      // Get assigned question_bank_ids
      const { data: rows } = await (supabase as any)
        .from("faculty_question_banks")
        .select("question_bank_id")
        .eq("faculty_user_id", userId);
      const ids = rows?.map((r: any) => r.question_bank_id) || [];
      if (ids.length > 0) {
        const { data: titleRows } = await (supabase as any)
          .from("question_bank_titles")
          .select("title")
          .in("id", ids);
        setAssignedTitles((titleRows || []).map((r: any) => r.title));
      } else {
        setAssignedTitles([]);
      }
    })();
  }, [userId]);
  if (!assignedTitles.length) return null;
  return <div className="mt-2 text-xs text-primary">Assigned: {assignedTitles.join(", ")}</div>;
}

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";


function QuestionBankAssignment({ userId }: { userId: string }) {
  const [assignedTitles, setAssignedTitles] = useState<string[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [allTitles, setAllTitles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch assigned titles (by title string)
    (supabase as any)
      .from("faculty_question_banks")
      .select("question_bank_id")
      .eq("faculty_user_id", userId)
      .then(async ({ data }: any) => {
        const ids = data?.map((r: any) => r.question_bank_id) || [];
        if (ids.length > 0) {
          const { data: titleRows } = await (supabase as any)
            .from("question_bank_titles")
            .select("title")
            .in("id", ids);
          const titles = (titleRows || []).map((r: any) => r.title);
          setAssignedTitles(titles);
          setSelected(titles); // always set selected to titles
        } else {
          setAssignedTitles([]);
          setSelected([]);
        }
      });
  }, [userId, showDialog]);

  const openDialog = async () => {
    setLoading(true);
    // Fetch unique titles from question_bank (status: verified)
    const { data, error } = await (supabase as any)
      .from("question_bank")
      .select("title")
      .eq("status", "verified");
    const titles = (data || [])
      .map((r: any) => (r.title || "").trim())
      .filter((t: string) => t.length > 0);
    const unique = Array.from(new Set(titles));
    setAllTitles(unique);
    setLoading(false);
    setShowDialog(true);
  };

  const handleSave = async () => {
    setLoading(true);
    // Remove all previous assignments, then add selected
    const delRes = await (supabase as any).from("faculty_question_banks").delete().eq("faculty_user_id", userId);
    if (delRes?.error) {
      console.error("Failed to delete previous faculty_question_banks:", delRes.error);
      toast.error("Failed to remove previous assignments");
    }
    if (selected.length > 0) {
      // For each selected title, get its id from question_bank_titles
      const titleRes = await (supabase as any)
        .from("question_bank_titles")
        .select("id, title").in("title", selected);
      const titleRows = titleRes?.data || [];
      if (titleRes?.error) {
        console.error("Error fetching question_bank_titles:", titleRes.error);
        toast.error("Failed to resolve selected titles to IDs");
      }
      console.log("Selected titles:", selected, "resolved titleRows:", titleRows);
      // If some selected titles are missing in question_bank_titles, create them (upsert)
      const resolvedTitles = (titleRows || []).map((r: any) => r.title);
      const missing = selected.filter((t) => !resolvedTitles.includes(t));
      if (missing.length > 0) {
        console.log("Missing title rows, creating:", missing);
        try {
          // insert missing titles (use upsert to avoid duplicates)
          const toInsert = missing.map((t) => ({ title: t, user_id: userId }));
          const upsertRes = await (supabase as any)
            .from("question_bank_titles")
            .upsert(toInsert, { onConflict: 'title' });
          if (upsertRes?.error) {
            console.error("Failed to upsert missing question_bank_titles:", upsertRes.error);
            toast.error("Failed to create missing title entries");
          } else {
            // re-query to get the newly created ids
            const retry = await (supabase as any)
              .from("question_bank_titles")
              .select("id, title").in("title", selected);
            if (retry?.error) {
              console.error("Retry fetch failed:", retry.error);
              toast.error("Failed to resolve titles after creating missing entries");
            } else {
              titleRows.length = 0;
              (retry.data || []).forEach((r: any) => titleRows.push(r));
            }
          }
        } catch (e) {
          console.error("Exception while creating missing titles:", e);
          toast.error("Error creating missing title entries");
        }
      }
      const rows = (titleRows || []).map((r: any) => ({ faculty_user_id: userId, question_bank_id: r.id }));
      if (rows.length > 0) {
        const ins = await (supabase as any).from("faculty_question_banks").insert(rows);
        if (ins?.error) {
          console.error("Insert into faculty_question_banks failed:", ins.error, "rows:", rows);
          toast.error("Failed to save assignments (DB error)");
        } else {
          toast.success("Assignments saved");
        }
      } else {
        console.warn("No titleRows found for selected titles", selected);
        toast.error("No matching title entries found for selected titles");
      }
      // Immediately update assignedTitles and selected in UI
      const titles = (titleRows || []).map((r: any) => r.title);
      setAssignedTitles(titles);
      setSelected(titles);
    } else {
      setAssignedTitles([]);
      setSelected([]);
    }
    setShowDialog(false);
    setLoading(false);
  };

  const filteredTitles = allTitles.filter((t) => t.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card className="mb-2">
      <CardHeader>
        <CardTitle className="text-base">Assigned Question Bank Titles</CardTitle>
      </CardHeader>
      <CardContent>
        {assignedTitles.length === 0 ? (
          <div className="text-muted-foreground text-sm mb-2">No question bank titles assigned.</div>
        ) : (
          <ul className="mb-2">
            {assignedTitles.map((t) => (
              <li key={t} className="flex items-center gap-2 text-sm py-1">
                <span>{t}</span>
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={async () => {
                    // Find the id for this title
                    const { data: titleRows } = await (supabase as any)
                      .from("question_bank_titles")
                      .select("id")
                      .eq("title", t);
                    const titleId = titleRows?.[0]?.id;
                    if (titleId) {
                      // Delete the assignment for this user and title
                      const delRes = await (supabase as any)
                        .from("faculty_question_banks")
                        .delete()
                        .eq("faculty_user_id", userId)
                        .eq("question_bank_id", titleId);
                      if (delRes?.error) {
                        toast.error("Failed to delete assignment");
                      } else {
                        setAssignedTitles((prev) => prev.filter((x) => x !== t));
                        setSelected((prev) => prev.filter((x) => x !== t));
                        toast.success("Assignment deleted");
                      }
                    } else {
                      toast.error("Could not find title id");
                    }
                  }}
                >Delete</Button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" size="sm" onClick={openDialog}>
          Add Question Bank
        </Button>
      </CardContent>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Question Bank Titles</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search question bank title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3"
            autoFocus
          />
          <div className="max-h-60 overflow-auto border rounded p-2 mb-2">
            {filteredTitles.length === 0 ? (
              <div className="text-muted-foreground text-sm">No results.</div>
            ) : (
              <ul>
                {filteredTitles.map((t) => (
                  <li key={t} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={selected.includes(t)}
                      onChange={() => {
                        setSelected((prev) =>
                          prev.includes(t)
                            ? prev.filter((id) => id !== t)
                            : [...prev, t]
                        );
                      }}
                    />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={loading}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setShowDialog(false)} disabled={loading}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
