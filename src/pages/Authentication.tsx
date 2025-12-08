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
  const [activeTab, setActiveTab] = useState<'create' | 'manage' | 'logs'>('create');
  // Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [questionTextMap, setQuestionTextMap] = useState<Record<string, string>>({});
  const [usersList, setUsersList] = useState<any[]>([]);
  const [banksList, setBanksList] = useState<any[]>([]);
  const [selectedUserFilter, setSelectedUserFilter] = useState<string | null>(null);
  const [selectedBankFilter, setSelectedBankFilter] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const LOGS_PAGE_SIZE = 200;

  // Fetch logs helper (uses current filters unless opts.recent === true)
  const fetchLogs = async (opts?: { recent?: boolean }) => {
    setLogsLoading(true);
    try {
      let q: any = supabase.from('question_activity_logs').select('*').order('created_at', { ascending: false });
      if (opts?.recent) {
        q = q.limit(LOGS_PAGE_SIZE);
      } else {
        if (selectedUserFilter) q = q.eq('user_id', selectedUserFilter);
        if (selectedBankFilter) q = q.eq('title_id', selectedBankFilter);
        if (actionFilter) q = q.eq('action', actionFilter);
        if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00Z');
        if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59Z');
      }
      const { data, error } = await q;
      if (error) {
        console.error('Logs fetch error', error);
        setLogs([]);
        toast.error('Failed to load logs (table may not exist)');
      } else {
        const rows = data || [];
        setLogs(rows);
        // Fetch question_texts for any question_ids present in logs
        try {
          const ids = Array.from(new Set((rows || []).map((r: any) => r.question_id).filter(Boolean)));
          if (ids.length) {
            const { data: qrows, error: qerr } = await (supabase as any)
              .from('question_bank')
              .select('id, question_text')
              .in('id', ids);
            if (!qerr && Array.isArray(qrows)) {
              const map: Record<string, string> = {};
              qrows.forEach((qr: any) => { map[qr.id] = qr.question_text || ''; });
              setQuestionTextMap(map);
            } else {
              setQuestionTextMap({});
            }
          } else {
            setQuestionTextMap({});
          }
        } catch (e) {
          console.warn('failed to fetch question texts for logs', e);
          setQuestionTextMap({});
        }
      }
    } catch (e) {
      console.error(e);
      setLogs([]);
    }
    setLogsLoading(false);
  };
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
        .select("user_id, full_name, email, college_id")
        .eq("role", "faculty");
      if (!error && data) {
        // Resolve college names for any college_ids
        const collegeIds = Array.from(new Set((data || []).map((r: any) => r.college_id).filter(Boolean)));
        let collegeMap: Record<string, string> = {};
        if (collegeIds.length) {
          const { data: cols } = await supabase.from('college').select('id, name').in('id', collegeIds);
          collegeMap = (cols || []).reduce((acc: any, c: any) => ({ ...acc, [c.id]: c.name }), {});
        }
        const enriched = (data || []).map((r: any) => ({ ...r, college_name: r.college_id ? collegeMap[r.college_id] || '' : '' }));
        setFacultyList(enriched);
      }
    };
    fetchFaculty();
  }, [loading]);

  // load available users and banks for logs filters
  useEffect(() => {
    (async () => {
      try {
        const { data: users } = await supabase.from('user_roles').select('user_id, full_name, email').eq('role', 'faculty');
        setUsersList(users || []);
      } catch (e) {
        setUsersList([]);
      }
      try {
        const { data: banks } = await (supabase as any).from('question_bank_titles').select('id, title');
        setBanksList(banks || []);
      } catch (e) {
        setBanksList([]);
      }
    })();
  }, []);

  // Auto-load recent logs when opening logs tab
  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs({ recent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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

  const toggleExpandLog = (id: string) => {
    setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const summarizeDetails = (details: any) => {
    if (details == null) return '-';
    if (typeof details !== 'object') return String(details);
    try {
      const keys = Object.keys(details || {});
      if (!keys.length) return JSON.stringify(details);
      const parts = keys.map(k => {
        const v = details[k];
        if (v && typeof v === 'object' && ('before' in v || 'after' in v)) {
          const before = v?.before ?? '-';
          const after = v?.after ?? '-';
          return `${k}: ${String(before)} → ${String(after)}`;
        }
        return `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`;
      });
      return parts.join('; ');
    } catch (e) {
      return String(details);
    }
  };

  const exportLogsAsJSON = () => {
    try {
      const blob = new Blob([JSON.stringify(logs || [], null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `question-activity-logs-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
      toast.error('Failed to export logs');
    }
  };

  const uniqueCount = (key: string) => {
    try {
      return Array.from(new Set((logs || []).map((r: any) => r[key] || '').filter(Boolean))).length;
    } catch (e) {
      return 0;
    }
  };

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
        <button
          className={`px-6 py-3 text-left w-full font-medium rounded-r-lg transition-all ${activeTab === 'logs' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/10'}`}
          onClick={() => setActiveTab('logs')}
        >
          Logs
        </button>
      </div>
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {activeTab === 'create' && (
          <div className="w-full max-w-2xl mb-8">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div>
                    <CardTitle>Create Faculty User</CardTitle>
                    <div className="text-sm text-muted-foreground">New Account for some faculty member to access some pages - IDCS</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateFaculty} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-1 md:col-span-2 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">F</div>
                    <div>
                      <div className="text-lg font-semibold">New Faculty Account</div>
                      <div className="text-sm text-muted-foreground">IDCS Login will be created for this faculty.</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      placeholder="Dr. Dinesh"
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
                      placeholder="faculty@krct.ac.in"
                    />
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
                        placeholder="Strong password"
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
                    <div className="text-xs text-muted-foreground">Default: <strong>KRCT@2024</strong>. You can instruct faculty to reset their password after first login.</div>
                  </div>

                  <div className="col-span-1 md:col-span-2">
                    <div className="font-semibold mb-2">College / Affiliation</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative" ref={dropdownRef}>
                        <Label htmlFor="collegeCode">College Code</Label>
                        <Input
                          id="collegeCode"
                          type="text"
                          value={collegeCode}
                          onChange={(e) => {
                            setCollegeCode(e.target.value);
                            setCollegeId("");
                            setCollegeName("");
                          }}
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

                      <div>
                        <Label htmlFor="collegeName">College Name</Label>
                        <Input
                          id="collegeName"
                          type="text"
                          value={collegeName}
                          onChange={(e) => {
                            setCollegeName(e.target.value);
                            setCollegeId("");
                            setCollegeCode("");
                          }}
                          placeholder="Type or select College Name"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">Select the college this faculty belongs to. If it doesn't exist, you can add it later.</div>
                  </div>

                  <div className="col-span-1 md:col-span-2 flex items-center justify-end gap-2 mt-2">
                    <Button type="button" variant="ghost" onClick={() => { setFullName(""); setEmail(""); setPassword("KRCT@2024"); setCollegeCode(""); setCollegeName(""); setCollegeId(""); }}>Reset</Button>
                    <Button type="submit" className="ml-2" disabled={loading}>{loading ? "Creating..." : "Create Faculty User"}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
        {activeTab === 'manage' && (
          <div className="w-full max-w-5xl mx-auto">
            <Card className="mb-4">
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div>
                    <CardTitle>Manage Faculty</CardTitle>
                    <div className="text-sm text-muted-foreground">Search, review and manage faculty accounts and their assigned question banks.</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Input
                    type="text"
                    placeholder="Search by name or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2">
                    <div className="space-y-3">
                      {filteredFaculty.length === 0 ? (
                        <div className="text-muted-foreground">No faculty users found.</div>
                      ) : (
                        filteredFaculty.map((f) => (
                          <div
                            key={f.user_id}
                            onClick={() => setSelectedUser(f)}
                            className={`p-4 rounded-lg border hover:shadow-md transition cursor-pointer ${selectedUser?.user_id === f.user_id ? 'ring-2 ring-primary/40' : 'bg-white'}`}>
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="text-base font-semibold">{f.full_name || '(no name)'}</div>
                                <div className="text-sm text-muted-foreground">{f.email || '(no email)'}</div>
                                {f.college_name ? <div className="text-sm text-muted-foreground mt-1">{f.college_name}</div> : null}
                                <QuestionBankAssignmentPreview userId={f.user_id} />
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <div className="text-xs text-muted-foreground">Actions</div>
                                <div className="flex gap-2">
                                  <Button size="xs" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedUser(f); }}>
                                    Edit
                                  </Button>
                                  <Button size="xs" variant="destructive" onClick={async (e) => { e.stopPropagation(); await handleDeleteUser(f.user_id); }}>
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-1">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Details</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!selectedUser ? (
                          <div className="text-sm text-muted-foreground">Select a faculty on the left to view details, assignments and actions.</div>
                        ) : (
                          <div className="space-y-3">
                            <div className="text-lg font-semibold">{selectedUser.full_name || '(no name)'}</div>
                            <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
                            {selectedUser.college_name && <div className="text-sm">{selectedUser.college_name}</div>}
                            <div>
                              <div className="font-medium mb-2">Assigned Question Banks</div>
                              <QuestionBankAssignment userId={selectedUser.user_id} />
                            </div>
                            <div className="flex gap-2 mt-2">
                              <Button variant="destructive" onClick={() => handleDeleteUser(selectedUser.user_id)}>Delete User</Button>
                              <Button variant="outline" onClick={() => toast.info('Access granted (demo)')}>Give Access</Button>
                              <Button variant="secondary" onClick={() => setSelectedUser(null)}>Clear</Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {activeTab === 'logs' && (
          <div className="w-full max-w-6xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold">Activity Logs</h3>
                <div className="text-sm text-muted-foreground">Audit trail for question updates, verifications and edits.</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="px-3 py-1 bg-muted rounded text-sm font-medium">{logs.length}</div>
                <div className="text-xs text-muted-foreground">Users</div>
                <div className="px-3 py-1 bg-muted rounded text-sm font-medium">{uniqueCount('user_id')}</div>
                <div className="text-xs text-muted-foreground">Banks</div>
                <div className="px-3 py-1 bg-muted rounded text-sm font-medium">{uniqueCount('title_id')}</div>
                <Button onClick={() => fetchLogs({ recent: true })}>Load Recent</Button>
                <Button variant="ghost" onClick={() => fetchLogs({ recent: false })}>Apply Filters</Button>
                <Button variant="outline" onClick={exportLogsAsJSON}>Export</Button>
              </div>
            </div>

            <Card className="mb-4">
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                  <div>
                    <Label>By User</Label>
                    <select className="w-full p-2 border rounded" value={selectedUserFilter ?? ''} onChange={e => setSelectedUserFilter(e.target.value || null)}>
                      <option value="">All users</option>
                      {usersList.map(u => <option key={u.user_id} value={u.user_id}>{u.full_name || u.email}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>By Bank</Label>
                    <select className="w-full p-2 border rounded" value={selectedBankFilter ?? ''} onChange={e => setSelectedBankFilter(e.target.value || null)}>
                      <option value="">All banks</option>
                      {banksList.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Action</Label>
                    <select className="w-full p-2 border rounded" value={actionFilter ?? ''} onChange={e => setActionFilter(e.target.value || null)}>
                      <option value="">All</option>
                      <option value="verified">Verified</option>
                      <option value="unverified">Unverified</option>
                      <option value="modified">Modified</option>
                    </select>
                  </div>
                  <div className="md:col-span-1">
                    <Label>From</Label>
                    <input type="date" className="w-full p-2 border rounded" value={dateFrom ?? ''} onChange={e => setDateFrom(e.target.value || null)} />
                  </div>
                  <div>
                    <Label>To</Label>
                    <input type="date" className="w-full p-2 border rounded" value={dateTo ?? ''} onChange={e => setDateTo(e.target.value || null)} />
                  </div>
                  <div className="md:col-span-4 flex gap-2">
                    <Button onClick={() => fetchLogs({ recent: false })}>Load Logs</Button>
                    <Button variant="outline" onClick={() => { setSelectedUserFilter(null); setSelectedBankFilter(null); setActionFilter(null); setDateFrom(null); setDateTo(null); setLogs([]); }}>Reset</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <CardTitle>Log Entries</CardTitle>
                  <div className="text-xs text-muted-foreground">Showing {logs.length} entries</div>
                </div>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="text-center">Loading...</div>
                ) : logs.length === 0 ? (
                  <div className="text-muted-foreground">No logs to show. Click "Load Logs" to fetch.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm divide-y">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 text-left">When</th>
                          <th className="p-2 text-left">User</th>
                          <th className="p-2 text-left">Action</th>
                          <th className="p-2 text-left">Question</th>
                          <th className="p-2 text-left">Bank</th>
                          <th className="p-2 text-left">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((r: any) => (
                          <tr key={r.id} className="border-b hover:bg-muted/10 align-top">
                            <td className="p-2 align-top text-xs text-muted-foreground">{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                            <td className="p-2 align-top">{(usersList.find(u => u.user_id === r.user_id)?.full_name) || r.user_id}</td>
                            <td className="p-2 align-top capitalize">{r.action || '-'}</td>
                            <td className="p-2 align-top" title={questionTextMap[r.question_id] || r.question_id || '-'}>
                              {(() => {
                                const t = questionTextMap[r.question_id];
                                if (t && t.length > 160) return t.slice(0, 160) + '…';
                                if (t) return t;
                                return r.question_id || '-';
                              })()}
                            </td>
                            <td className="p-2 align-top">{(banksList.find(b => b.id === r.title_id)?.title) || r.title_id || '-'}</td>
                            <td className="p-2 align-top">
                              {r.details == null ? (
                                '-'
                              ) : (
                                <div className="flex flex-col gap-2">
                                  <div className="text-xs text-muted-foreground">
                                    {(() => {
                                      const summary = summarizeDetails(r.details);
                                      return summary.length > 140 ? summary.slice(0, 140) + '…' : summary;
                                    })()}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      className="text-xs text-primary underline"
                                      onClick={() => toggleExpandLog(r.id)}
                                    >
                                      {expandedLogs[r.id] ? 'Hide details' : 'Show details'}
                                    </button>
                                  </div>
                                  {expandedLogs[r.id] ? (
                                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-w-2xl whitespace-pre-wrap">{JSON.stringify(r.details, null, 2)}</pre>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
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
    // Fetch unique titles from question_bank (all statuses)
    const { data, error } = await (supabase as any)
      .from("question_bank")
      .select("title");
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

// markVerified function
const markVerified = async () => {
  if (!selectedQuestion) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in');

    // Save question update
    const { error } = await supabase
      .from("question_bank")
      .update({
        ...editedQuestion,
        status: "verified",
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedQuestion.id);

    if (error) throw error;

    // Write activity log
    await supabase.from('question_activity_logs').insert([{
      user_id: user.id,
      action: 'verified',
      question_id: selectedQuestion.id,
      title_id: selectedQuestion.title_id,
      details: {
        before: selectedQuestion,         // optional: small snapshot
        after: editedQuestion
      }
    }]);

    toast({ title: "Success", description: "Question marked as verified" });
    setIsEditDialogOpen(false);
    fetchQuestions(selectedBankId || undefined);
  } catch (error) {
    toast({ title: "Error", description: "Failed to mark as verified", variant: "destructive" });
  }
};
