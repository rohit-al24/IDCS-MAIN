import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ImageSrcs = Record<string, string>;

function useQuestionImages(questions: any[]): ImageSrcs {
  const [imageSrcs, setImageSrcs] = useState<ImageSrcs>({});
  const createdUrls = useRef<string[]>([]);

  useEffect(() => {
    let mounted = true;
    const urls: ImageSrcs = {};
    const pngSig = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
    const jpgSig = new Uint8Array([0xff,0xd8,0xff]);
    const findSignature = (buf: Uint8Array, sig: Uint8Array) => {
      for (let i = 0; i <= buf.length - sig.length; i++) {
        let ok = true;
        for (let j = 0; j < sig.length; j++) {
          if (buf[i + j] !== sig[j]) { ok = false; break; }
        }
        if (ok) return i;
      }
      return -1;
    };
    const processUrl = async (qId: string, url: string) => {
      try {
        if (!url) return;
        if (url.startsWith('data:')) { urls[qId] = url; return; }
        const res = await fetch(url);
        if (!res.ok) return;
        const contentType = res.headers.get('content-type') || '';
        const arrBuf = await res.arrayBuffer();
        const u8 = new Uint8Array(arrBuf);
        if (contentType.startsWith('image/')) {
          const blob = new Blob([u8], { type: contentType.split(';')[0] });
          const obj = URL.createObjectURL(blob);
          createdUrls.current.push(obj);
          urls[qId] = obj;
          return;
        }
        let off = findSignature(u8, pngSig);
        let mime = 'image/png';
        if (off === -1) { off = findSignature(u8, jpgSig); mime = 'image/jpeg'; }
        if (off >= 0) {
          const sliced = u8.slice(off);
          const blob = new Blob([sliced], { type: mime });
          const obj = URL.createObjectURL(blob);
          createdUrls.current.push(obj);
          urls[qId] = obj;
          return;
        }
        const text = new TextDecoder().decode(u8);
        const m = text.match(/data:image\/(png|jpeg);base64,([A-Za-z0-9+\/\=\n\r]+)/);
        if (m) {
          urls[qId] = `data:image/${m[1]};base64,${m[2].replace(/\s+/g, '')}`;
          return;
        }
      } catch (err) {}
    };
    (async () => {
      const tasks: Promise<void>[] = [];
      for (const q of questions) {
        if (!q?.image_url) continue;
        tasks.push(processUrl(q.id, q.image_url));
      }
      await Promise.all(tasks);
      if (mounted) setImageSrcs(urls);
    })();
    return () => {
      mounted = false;
      createdUrls.current.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    };
  }, [questions]);
  return imageSrcs;
}
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { ArrowLeft, Download, FileText, Key } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { Document, Packer, Paragraph, TextRun, ImageRun } from "docx";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { BACKEND_BASE_URL } from "@/config/api";

type Template = Tables<"templates">;
type Question = Tables<"question_bank">;

// Extend the Question type to include additional properties
interface ExtendedQuestion extends Question {
  part?: string;
  baseNumber?: number;
  sub?: string;
}

const GeneratePaper = () => {
    // Helper: prefer Excel-style CO numbers text
    const getCoText = (q: any): string => {
      const nums = String((q?.course_outcomes_numbers ?? '')).trim();
      if (nums) return nums;
      const cell = String((q?.course_outcomes_cell ?? '')).trim();
      const m1 = cell.match(/[1-5]/g);
      if (m1 && m1.length) return Array.from(new Set(m1)).join(',');
      const co = String((q?.course_outcomes ?? '')).trim();
      const m2 = co.match(/[1-5]/g);
      if (m2 && m2.length) return Array.from(new Set(m2)).join(',');
      return co || '-';
    };
    // --- Manual Pick State & Functions ---
    const [manualPick, setManualPick] = useState<{ open: boolean; copy: 1|2; qIdx: number|null }>({ open: false, copy: 1, qIdx: null });
    const [manualPickList, setManualPickList] = useState<any[]>([]);
    const [manualPickLoading, setManualPickLoading] = useState(false);
    const [manualPickType, setManualPickType] = useState<string>("");
    // Debug counts for Part B chapter verification
    const [debugCounts, setDebugCounts] = useState<{ partBTotal: number; chapterCounts: Record<string, number> } | null>(null);
    const [showDebugCounts, setShowDebugCounts] = useState<boolean>(true);

    // Open manual pick dialog for a question
    const openManualPick = async (copy: 1|2, qIdx: number) => {
      setManualPickLoading(true);
      setManualPick({ open: true, copy, qIdx });
      setManualPickType("");
      // Fetch all questions for the selected bank
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !selectedQuestionBank) { setManualPickList([]); setManualPickLoading(false); return; }
      const { data } = await supabase
        .from("question_bank")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "verified")
        .eq("title", selectedQuestionBank);
      setManualPickList(data || []);
      setManualPickLoading(false);
    };

    // Replace a generated question with a manually picked one
    const pickManualQuestion = (picked: any) => {
      if (manualPick.qIdx == null) return;
      if (manualPick.copy === 1) {
        setGeneratedQuestions1(list => list.map((q, idx) =>
          idx === manualPick.qIdx
            ? {
                ...picked,
                baseNumber: (q as any).baseNumber,
                sub: (q as any).sub,
                part: (q as any).part,
                marks: q.marks,
                or: (q as any).or,
                co: getCoText(picked)
              } as Question & { baseNumber?: number; sub?: string; part?: string; or?: boolean; co?: string }
            : q
        ));
      } else {
        setGeneratedQuestions2(list => list.map((q, idx) =>
          idx === manualPick.qIdx
            ? {
                ...picked,
                baseNumber: (q as any).baseNumber,
                sub: (q as any).sub,
                part: (q as any).part,
                marks: q.marks,
                or: (q as any).or,
                co: getCoText(picked)
              } as Question & { baseNumber?: number; sub?: string; part?: string; or?: boolean; co?: string }
            : q
        ));
      }
      setManualPick({ open: false, copy: 1, qIdx: null });
    };
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [generatedQuestions1, setGeneratedQuestions1] = useState<Question[]>([]);
  const [generatedQuestions2, setGeneratedQuestions2] = useState<Question[]>([]);
  const [answerKey1, setAnswerKey1] = useState<{ questionNumber: number; answer: string }[]>([]);
  const [answerKey2, setAnswerKey2] = useState<{ questionNumber: number; answer: string }[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<"word" | "excel">("word");
  // Question Bank (title) selection
  const [questionBanks, setQuestionBanks] = useState<string[]>([]);
  const [selectedQuestionBank, setSelectedQuestionBank] = useState<string>("");
  const [questionBankSearch, setQuestionBankSearch] = useState<string>("");
  // Document meta for DOCX generation (user provided)
  const [docMeta, setDocMeta] = useState({
    dept: "CSE",
    cc: "CS3401",
    cn: "",
    qpcode: "QP123",
    exam_title: "",
    regulation: "Regulation 2023",
    semester: "Second Semester",
  });
  const departmentOptions = [
    "Computer Science and Engineering",
    "Information Technology",
    "Electronics and Communication Engineering",
    "Electrical and Electronics Engineering",
    "Civil Engineering",
    "Mechanical Engineering",
    "Artificial Intelligence and Data Science",
    "Artificial Intelligence and Machine Learning",
  ];
  const semesterOptions = [
    "First Semester",
    "Second Semester",
    "Third Semester",
    "Fourth Semester",
    "Fifth Semester",
    "Sixth Semester",
    "Seventh Semester",
    "Eighth Semester",
  ];
  // Duplicate check state
  const [dups1, setDups1] = useState<Set<string>>(new Set());
  const [dups2, setDups2] = useState<Set<string>>(new Set());
  const [lastVerifiedQuestions, setLastVerifiedQuestions] = useState<Question[]>([]);
  const [lastTemplate, setLastTemplate] = useState<Template | null>(null);
  const [checking, setChecking] = useState<boolean>(false);
  const [showVerifiedPopup, setShowVerifiedPopup] = useState<boolean>(false);
  // Full-screen preview dialog state
  const [expandedOpen, setExpandedOpen] = useState<boolean>(false);

  // --- Image hooks must be at the top level ---
  const imageSrcs1 = useQuestionImages(generatedQuestions1);
  const imageSrcs2 = useQuestionImages(generatedQuestions2);
  // Track per-question OCR selection (convert image to text in DOCX)
  const [ocrSelections1, setOcrSelections1] = useState<Record<string, boolean>>({});
  const [ocrSelections2, setOcrSelections2] = useState<Record<string, boolean>>({});

  // Pagination state for question bank questions
  const [questionsPage, setQuestionsPage] = useState(1);
  const QUESTIONS_PAGE_SIZE = 50;
  const [totalQuestions, setTotalQuestions] = useState(0);

  useEffect(() => {
    fetchTemplates();
    fetchQuestionBanks();
  }, []);

  // Fetch course metadata (course_code, course_name, semester) for selected question bank
  useEffect(() => {
    const fetchBankMeta = async () => {
      try {
        if (!selectedQuestionBank) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // Prefer question_bank_titles table if available
        const { data: titlesData, error: titlesErr } = await (supabase as any)
          .from("question_bank_titles")
          .select("course_code, course_name, semester")
          .eq("title", selectedQuestionBank)
          .limit(1);
        let course_code = "";
        let course_name = "";
        let semester = "";
        if (!titlesErr && Array.isArray(titlesData) && titlesData.length > 0) {
          const row = titlesData[0] || {};
          course_code = String(row.course_code || "");
          course_name = String(row.course_name || "");
          semester = String(row.semester || "");
        } else {
          // Fallback: derive from any question in this bank if fields exist later
          const { data: anyQ } = await supabase
            .from("question_bank")
            .select("course_code, course_name, semester")
            .eq("user_id", user.id)
            .eq("status", "verified")
            .eq("title", selectedQuestionBank)
            .limit(1);
          const row = (Array.isArray(anyQ) && anyQ[0]) || {};
          course_code = String((row as any)?.course_code || "");
          course_name = String((row as any)?.course_name || "");
          semester = String((row as any)?.semester || "");
        }
        if (course_code || course_name || semester) {
          setDocMeta(prev => ({
            ...prev,
            cc: course_code || prev.cc,
            cn: course_name || prev.cn,
            semester: semester || prev.semester,
          }));
        }
      } catch (e) {
        // Silent fallback
      }
    };
    fetchBankMeta();
  }, [selectedQuestionBank]);

  const fetchTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("templates")
        .select("*")
        .eq("user_id", user.id);

      setTemplates(data || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to fetch templates", variant: "destructive" });
    }
  };

  const fetchQuestionBanks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Fetch verified question titles for user; assume 'title' column exists
      const { data, error } = await supabase
        .from("question_bank")
        .select("title")
        .eq("user_id", user.id)
        .eq("status", "verified");
      if (error) {
        console.warn("fetchQuestionBanks error", error);
        return;
      }
      const titles = (data || [])
        .map((r: any) => (r.title || "").trim())
        .filter((t: string) => t.length > 0);
      const unique = Array.from(new Set(titles));
      setQuestionBanks(unique);
    } catch (e) {
      console.error("Failed to fetch question bank titles", e);
    }
  };

  // When fetching questions for a selected bank, use backend pagination
  const fetchQuestionsForBank = async (bankTitle: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      // Get total count
      const { count } = await supabase
        .from("question_bank")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "verified")
        .eq("title", bankTitle);
      setTotalQuestions(count || 0);
      // Fetch only the current page
      const { data, error } = await supabase
        .from("question_bank")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "verified")
        .eq("title", bankTitle)
        .range((questionsPage - 1) * QUESTIONS_PAGE_SIZE, questionsPage * QUESTIONS_PAGE_SIZE - 1);
      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  };

  // Helper: generate one copy given template & verified questions, excluding pickedIds.
  const generateSinglePaper = (
    verifiedQuestions: Question[],
    template: Template,
    excludeIds: Set<string> = new Set()
  ) => {
    const partAQuestions: Question[] = [];
    const pickedIds = new Set<string>(excludeIds);
    const CO_LIST = ["CO1", "CO2", "CO3", "CO4", "CO5"];
    let coMisses: string[] = [];
    let partBMisses: { co: string, btl?: string, baseNumber: number }[] = [];
    // Shared BTL for CO3-CO5
    const candidateBtls = [3,4,5];
    let chosenBtl: number | null = null;
    for (const b of [...candidateBtls].sort(() => Math.random()-0.5)) {
      let ok = true;
      for (const co of CO_LIST.slice(2)) { // CO3..CO5
        const hasObj = verifiedQuestions.some(q => {
          const qco = ((q as any).course_outcomes || '').toString().trim().toLowerCase();
          return q.type === 'objective' && qco === co.toLowerCase() && Number((q as any).btl) === b && !pickedIds.has(q.id);
        });
        const hasDesc = verifiedQuestions.some(q => {
          const qco = ((q as any).course_outcomes || '').toString().trim().toLowerCase();
          return q.type === 'descriptive' && qco === co.toLowerCase() && Number((q as any).btl) === b && !pickedIds.has(q.id);
        });
        if (!hasObj || !hasDesc) { ok = false; break; }
      }
      if (ok) { chosenBtl = b; break; }
    }
    if (chosenBtl === null) {
      return { generated: [], answerKey: [], pickedIds };
    }
    const sectionA = (template.sections as any[]).find((s: any) => (s.name || '').toLowerCase().includes('section a'));
    const requiredMarksA = sectionA?.marksPerQuestion || 2;
    for (const [index, co] of CO_LIST.entries()) {
      const enforceBtl = index >= 2;
      const poolObj = verifiedQuestions.filter(q => {
        const qco = ((q as any).course_outcomes || '').toString().trim().toLowerCase();
        const qbtl = Number((q as any).btl);
        return q.type === 'objective' && qco === co.toLowerCase() && (!enforceBtl || qbtl === chosenBtl) && Number(q.marks) === Number(requiredMarksA) && !pickedIds.has(q.id);
      });
      const poolDesc = verifiedQuestions.filter(q => {
        const qco = ((q as any).course_outcomes || '').toString().trim().toLowerCase();
        const qbtl = Number((q as any).btl);
        return q.type === 'descriptive' && qco === co.toLowerCase() && (!enforceBtl || qbtl === chosenBtl) && Number(q.marks) === Number(requiredMarksA) && !pickedIds.has(q.id);
      });
      if (poolObj.length === 0) { coMisses.push(`${co}-objective`); continue; }
      if (poolDesc.length === 0) { coMisses.push(`${co}-descriptive`); continue; }
      const qObj = poolObj[Math.floor(Math.random()*poolObj.length)];
      pickedIds.add(qObj.id);
      (qObj as any).co = (qObj as any).course_outcomes;
      partAQuestions.push(qObj);
      const qDesc = poolDesc[Math.floor(Math.random()*poolDesc.length)];
      pickedIds.add(qDesc.id);
      (qDesc as any).co = (qDesc as any).course_outcomes;
      partAQuestions.push(qDesc);
    }
    let partAMisses: { co: string, type: string, idx: number }[] = [];
    if (partAQuestions.length < 10) {
      // For each CO and type, if missing, add a placeholder
      const sectionAConfig = (template.sections as any[]).find((s: any) => (s.name || '').toLowerCase().includes('section a'));
      const sectionAQs: any[] = sectionAConfig?.questions || [];
      const tplObjectives = sectionAQs.filter(q => q.type === 'objective');
      const tplDescriptives = sectionAQs.filter(q => q.type === 'descriptive');
      let objPtr = 0, descPtr = 0;
      for (const [index, co] of CO_LIST.entries()) {
        const enforceBtl = index >= 2;
        // Objective
        const poolObj = verifiedQuestions.filter(q => {
          const qco = ((q as any).course_outcomes || '').toString().trim().toLowerCase();
          const qbtl = Number((q as any).btl);
          return q.type === 'objective' && qco === co.toLowerCase() && (!enforceBtl || qbtl === chosenBtl) && Number(q.marks) === Number(sectionAConfig?.marksPerQuestion || 2) && !pickedIds.has(q.id);
        });
        if (poolObj.length === 0) {
          partAMisses.push({ co, type: 'objective', idx: objPtr });
        } else { objPtr++; }
        // Descriptive
        const poolDesc = verifiedQuestions.filter(q => {
          const qco = ((q as any).course_outcomes || '').toString().trim().toLowerCase();
          const qbtl = Number((q as any).btl);
          return q.type === 'descriptive' && qco === co.toLowerCase() && (!enforceBtl || qbtl === chosenBtl) && Number(q.marks) === Number(sectionAConfig?.marksPerQuestion || 2) && !pickedIds.has(q.id);
        });
        if (poolDesc.length === 0) {
          partAMisses.push({ co, type: 'descriptive', idx: descPtr });
        } else { descPtr++; }
      }
    }
    const generated: (Question & { sub?: 'a'|'b'; baseNumber?: number; part?: 'A'|'B'; or?: boolean, _insufficient?: boolean, _insufficientCo?: string, _insufficientType?: string })[] = [];
    // Assign numbering and marks (objective/descriptive lists for alignment)
    const sectionAConfig = (template.sections as any[]).find((s: any) => (s.name || '').toLowerCase().includes('section a'));
    const sectionAQs: any[] = sectionAConfig?.questions || [];
    const tplObjectives = sectionAQs.filter(q => q.type === 'objective');
    const tplDescriptives = sectionAQs.filter(q => q.type === 'descriptive');
    let objPtr = 0, descPtr = 0;
    const defaultA = sectionAConfig?.marksPerQuestion || 2;
    let aIdx = 0;
    for (let i = 0; i < 10; i++) {
      if (partAMisses.some(m => m.idx === i - (partAMisses.filter(m => m.idx < i).length) && m.type === (i % 2 === 0 ? 'objective' : 'descriptive'))) {
        // Insert placeholder for missing question
        const miss = partAMisses.find(m => m.idx === i - (partAMisses.filter(m => m.idx < i).length) && m.type === (i % 2 === 0 ? 'objective' : 'descriptive'));
        generated.push({ part: 'A', baseNumber: i + 1, sub: undefined, marks: defaultA, co: miss?.co, btl: '', question_text: '', _insufficient: true, _insufficientCo: miss?.co, _insufficientType: miss?.type } as any);
      } else if (partAQuestions[aIdx]) {
        (partAQuestions[aIdx] as any).part = 'A';
        (partAQuestions[aIdx] as any).baseNumber = i + 1;
        (partAQuestions[aIdx] as any).marks = defaultA;
        generated.push(partAQuestions[aIdx] as any);
        aIdx++;
      }
    }
    // Part B pairs
    const sectionB = (template.sections as any[]).find((s: any) => (s.name || '').toLowerCase().includes('section b'));
    if (sectionB) {
      const startNumber = 11;
      const sectionBQuestions = sectionB.questions || [];
      for (let pairIndex = 0; pairIndex < 5; pairIndex++) {
        const config = sectionBQuestions[pairIndex] || {};
        const baseNumber = startNumber + pairIndex;
        const pool = verifiedQuestions.filter(q => {
          const qco = ((q as any).course_outcomes || '').toString().trim().toLowerCase();
          const coNorm = (config.co || 'CO1').toString().trim().toLowerCase();
          const typeMatch = !config.type || q.type === config.type;
          const coMatch = coNorm === 'random' ? true : (qco === coNorm);
          const btlMatch = !config.btl || config.btl === 'random' || (String((q as any).btl) === String(config.btl).replace(/BTL/,'') ) || (String((q as any).btl) === String(config.btl));
          const notUsed = !pickedIds.has(q.id);
          const marksMatch = Number(q.marks) === Number(config.marks || 16);
          return typeMatch && coMatch && btlMatch && notUsed && marksMatch;
        });
        let qa: any = null, qb: any = null;
        // Enforce chapter-based selection: A -> chapter '1', B -> chapter '2'
        const poolA = pool.filter(q => String(q.chapter) === '1');
        const poolB = pool.filter(q => String(q.chapter) === '2');

        if (poolA.length > 0 && poolB.length > 0) {
          // Prefer matching BTL across the pair; if not possible, pick any from poolB
          qa = poolA[Math.floor(Math.random() * poolA.length)];
          const qaBTL = String((qa as any).btl);
          const poolBMatching = poolB.filter(q => String((q as any).btl) === qaBTL);
          if (poolBMatching.length > 0) qb = poolBMatching[Math.floor(Math.random() * poolBMatching.length)];
          else qb = poolB[Math.floor(Math.random() * poolB.length)];
          if (qa && qb) {
            pickedIds.add(qa.id); pickedIds.add(qb.id);
            (qa as any).co = (qa as any).course_outcomes; (qb as any).co = (qb as any).course_outcomes;
            (qa as any).part = 'B'; (qb as any).part = 'B';
            (qa as any).baseNumber = baseNumber; (qb as any).baseNumber = baseNumber;
            (qa as any).sub = 'a'; (qb as any).sub = 'b';
            (qa as any).or = false; (qb as any).or = true;
            const marksToAssign = config.marks || 16;
            (qa as any).marks = marksToAssign; (qb as any).marks = marksToAssign;
            const btlValue = (qa as any).btl; (qb as any).btl = btlValue;
            generated.push(qa as any); generated.push(qb as any);
          }
        } else if (poolA.length > 0 && poolB.length === 0) {
          // Only A available (chapter 1); insert A and placeholder for B
          qa = poolA[Math.floor(Math.random() * poolA.length)];
          (qa as any).co = (qa as any).course_outcomes;
          (qa as any).part = 'B';
          (qa as any).baseNumber = baseNumber;
          (qa as any).sub = 'a';
          (qa as any).or = false;
          (qa as any).marks = config.marks || 16;
          pickedIds.add(qa.id);
          generated.push(qa as any);
          generated.push({ part: 'B', baseNumber, sub: 'b', or: true, marks: config.marks || 16, co: '', btl: '', question_text: '', _insufficient: true, _insufficientCo: config.co, _insufficientBtl: config.btl } as any);
          partBMisses.push({ co: config.co, btl: config.btl, baseNumber });
        } else if (poolA.length === 0 && poolB.length > 0) {
          // Only B available (chapter 2); insert placeholder for A and real B
          qb = poolB[Math.floor(Math.random() * poolB.length)];
          (qb as any).co = (qb as any).course_outcomes;
          (qb as any).part = 'B';
          (qb as any).baseNumber = baseNumber;
          (qb as any).sub = 'b';
          (qb as any).or = true;
          (qb as any).marks = config.marks || 16;
          pickedIds.add(qb.id);
          generated.push({ part: 'B', baseNumber, sub: 'a', or: false, marks: config.marks || 16, co: '', btl: '', question_text: '', _insufficient: true, _insufficientCo: config.co, _insufficientBtl: config.btl } as any);
          generated.push(qb as any);
          partBMisses.push({ co: config.co, btl: config.btl, baseNumber });
        } else {
          // Neither available: placeholders for both
          generated.push({ part: 'B', baseNumber, sub: 'a', or: false, marks: config.marks || 16, co: '', btl: '', question_text: '', _insufficient: true, _insufficientCo: config.co, _insufficientBtl: config.btl } as any);
          generated.push({ part: 'B', baseNumber, sub: 'b', or: true, marks: config.marks || 16, co: '', btl: '', question_text: '', _insufficient: true, _insufficientCo: config.co, _insufficientBtl: config.btl } as any);
          partBMisses.push({ co: config.co, btl: config.btl, baseNumber });
        }
      }
    }
    // Part C: Single pair (16.a / 16.b), fetch 16-mark questions but allow projecting marks via section.projectionMarks
    const sectionC = (template.sections as any[]).find((s: any) => (s.baseQuestionNumber === 16) || ((s.name || '').toLowerCase().includes('section c')));
    if (sectionC) {
      const baseNumber = 16;
      const configQs: any[] = sectionC.questions || [];
      const cfgA = configQs[0] || {}; const cfgB = configQs[1] || {};
      const requiredMarks = Number(sectionC.marksPerQuestion || 16); // fetch from 16 marks
      const displayMarks = Number(sectionC.projectionMarks || requiredMarks);
      // Strictly enforce pulling Part_C typed questions when template indicates Part C
      const enforcePartCType = (cfgA.type === 'Part_C') || (cfgB.type === 'Part_C') || (sectionC.typePattern === 'PART_C');
      const poolA = verifiedQuestions.filter(q => {
        const qco = ((q as any).course_outcomes || '').toString().trim().toLowerCase();
        const coNormA = String(cfgA.co || 'CO1').toLowerCase();
        const coMatch = coNormA === 'random' ? true : (qco === coNormA);
        // Accept Part_C if any type field matches
        const allTypes = [q.type, (q as any).TYPE, (q as any).type_letter, (q as any).excel_type].map(t => String(t || '').toUpperCase());
        const typeMatch = enforcePartCType ? allTypes.includes('PART_C') : (!cfgA.type || q.type === cfgA.type || q.type === 'descriptive');
        const btlMatch = !cfgA.btl || cfgA.btl === 'random' || String((q as any).btl) === String(cfgA.btl).replace(/BTL/i,'');
        const notUsed = !pickedIds.has(q.id);
        const marksMatch = Number(q.marks) === requiredMarks;
        // If excelType hint is provided, honor TYPE=C style flags when available on the record
        const typeLetter = String(((q as any).excel_type || (q as any).type_letter || (q as any).TYPE || '')).toUpperCase();
        const excelTypeOk = sectionC.excelType ? (typeLetter === String(sectionC.excelType).toUpperCase()) : true;
        return coMatch && typeMatch && btlMatch && notUsed && marksMatch && excelTypeOk;
      });
      let qa:any = null, qb:any = null;
      if (poolA.length > 0) {
        qa = poolA[Math.floor(Math.random()*poolA.length)];
        const qaBTL = String((qa as any).btl);
        const poolB = verifiedQuestions.filter(q => {
          const qco = ((q as any).course_outcomes || '').toString().trim().toLowerCase();
          const coNormB = String(cfgB.co || cfgA.co || 'CO1').toLowerCase();
          const coMatch = coNormB === 'random' ? true : (qco === coNormB);
          const allTypes = [q.type, (q as any).TYPE, (q as any).type_letter, (q as any).excel_type].map(t => String(t || '').toUpperCase());
          const typeMatch = enforcePartCType ? allTypes.includes('PART_C') : (!cfgB.type || q.type === cfgB.type || q.type === 'descriptive');
          const btlMatch = !cfgB.btl || cfgB.btl === 'random' || String((q as any).btl) === qaBTL;
          const notUsed = !pickedIds.has(q.id) && q.id !== qa.id;
          const marksMatch = Number(q.marks) === requiredMarks;
          const typeLetter = String(((q as any).excel_type || (q as any).type_letter || (q as any).TYPE || '')).toUpperCase();
          const excelTypeOk = sectionC.excelType ? (typeLetter === String(sectionC.excelType).toUpperCase()) : true;
          return coMatch && typeMatch && btlMatch && notUsed && marksMatch && excelTypeOk;
        });
        if (poolB.length > 0) {
          qb = poolB[Math.floor(Math.random()*poolB.length)];
        }
        // assign a
        pickedIds.add(qa.id);
        (qa as any).co = (qa as any).course_outcomes; (qa as any).part = 'C';
        (qa as any).baseNumber = baseNumber; (qa as any).sub = 'a'; (qa as any).or = false;
        (qa as any).marks = displayMarks; generated.push(qa as any);
        // assign b or placeholder
        if (qb) {
          pickedIds.add(qb.id);
          (qb as any).co = (qb as any).course_outcomes; (qb as any).part = 'C';
          (qb as any).baseNumber = baseNumber; (qb as any).sub = 'b'; (qb as any).or = true;
          (qb as any).marks = displayMarks; generated.push(qb as any);
        } else {
          generated.push({ part: 'C', baseNumber, sub: 'b', or: true, marks: displayMarks, co: '', btl: '', question_text: '', _insufficient: true, _insufficientCo: (cfgB.co||cfgA.co) } as any);
        }
      } else {
        // placeholders if none
        const display = displayMarks;
        generated.push({ part: 'C', baseNumber, sub: 'a', or: false, marks: display, co: '', btl: '', question_text: '', _insufficient: true, _insufficientCo: (cfgA.co||'CO1') } as any);
        generated.push({ part: 'C', baseNumber, sub: 'b', or: true, marks: display, co: '', btl: '', question_text: '', _insufficient: true, _insufficientCo: (cfgB.co||cfgA.co||'CO1') } as any);
      }
    }
    const answerKey = generated.filter(q => (q as any).correct_answer).map(q => ({
      questionNumber: (q as any).baseNumber ? `${(q as any).baseNumber}${(q as any).sub ? '.' + (q as any).sub : ''}` : '?',
      answer: (q as any).correct_answer || ''
    }));
    return { generated, answerKey, pickedIds, partBMisses, partAMisses };
  };

  const generatePaper = async () => {
          // Place debug CO/type logging after verifiedQuestions is defined
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const template = templates.find((t) => t.id === selectedTemplateId);
      if (!template) {
        toast({ title: "Error", description: "Please select a template", variant: "destructive" });
        return;
      }

      if (!selectedQuestionBank) {
        toast({ title: "Select Bank", description: "Please select a question bank title first", variant: "destructive" });
        return;
      }
      const { data: verifiedQuestions, error: vqError } = await supabase
        .from("question_bank")
        .select("*")
        .match({ user_id: user.id, status: "verified", title: selectedQuestionBank });
      if (vqError) {
        console.error("Fetch verified questions error", vqError);
        toast({ title: "DB Error", description: vqError.message, variant: "destructive" });
        return;
      }

      if (!verifiedQuestions || verifiedQuestions.length === 0) {
        // Only build map if array exists
        if (Array.isArray(verifiedQuestions)) {
          const coTypeMap: Record<string, Set<string>> = {};
          for (const q of verifiedQuestions) {
            const co = ((q as any).course_outcomes || '').toString().trim().toLowerCase();
            const type = q.type;
            if (!coTypeMap[co]) coTypeMap[co] = new Set();
            coTypeMap[co].add(type);
          }
          const debugMsg = Object.entries(coTypeMap)
            .map(([co, types]) => `${co}: [${Array.from(types).join(', ')}]`).join(' | ');
          if (debugMsg) toast({ title: 'Debug (Empty)', description: debugMsg, variant: 'default' });
        }
        toast({ title: "Error", description: "No verified questions available", variant: "destructive" });
        return;
      }

      // Debug: compute Part B chapter counts so user can verify DB tagging
      try {
        const partB = (verifiedQuestions || []).filter((q: any) => (q.part || q.type)?.toString().toUpperCase().includes('B') || (q.part === 'B'));
        const chapterCounts: Record<string, number> = {};
        for (const q of partB) {
          const ch = (q.chapter ?? '').toString() || 'unknown';
          chapterCounts[ch] = (chapterCounts[ch] || 0) + 1;
        }
        setDebugCounts({ partBTotal: partB.length, chapterCounts });
      } catch (e) {
        console.warn('Failed to compute debug counts', e);
      }


      // Generate Copy 1
      const { generated: gen1, answerKey: key1, pickedIds } = generateSinglePaper(verifiedQuestions, template);
      if (gen1.length === 0) {
        toast({ title: 'Error', description: 'Failed to generate Copy 1 (insufficient questions).', variant: 'destructive' });
        return;
      }
      // Generate Copy 2 excluding Copy 1 questions
      const { generated: gen2, answerKey: key2 } = generateSinglePaper(verifiedQuestions, template, pickedIds);
      if (gen2.length === 0) {
        toast({ title: 'Warning', description: 'Copy 2 could not be fully generated (insufficient remaining questions). Showing only Copy 1.', variant: 'destructive' });
      }
      setGeneratedQuestions1(gen1 as any);
      setGeneratedQuestions2(gen2 as any);
      setLastVerifiedQuestions(verifiedQuestions as any);
      setLastTemplate(template);
      // reset duplicates state on fresh generation
      setDups1(new Set());
      setDups2(new Set());
      setAnswerKey1(key1.map(k => ({ questionNumber: Number(k.questionNumber), answer: String(k.answer) })));
      setAnswerKey2(key2.map(k => ({ questionNumber: Number(k.questionNumber), answer: String(k.answer) })));
      setIsGenerated(true);

      await supabase.from("generated_papers").insert({
        user_id: user.id,
        template_id: selectedTemplateId,
        questions: generatedQuestions1,
        answer_key: key1,
      });

      toast({ title: "Success", description: "Question paper generated successfully" });
    } catch (error: any) {
      console.error("generatePaper fatal error", error);
      toast({ title: "Error", description: `Failed to generate paper: ${error.message || error}`, variant: "destructive" });
    }
  };

  // Normalize question text for duplicate comparison
  const norm = (s: string | undefined) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  // Check duplicates across Copy 1 and Copy 2
  const checkDuplicates = () => {
    if (!isGenerated) return;
    setChecking(true);
    try {
      const map1 = new Map<string, string>(); // normText -> id
      const map2 = new Map<string, string>();
      generatedQuestions1.forEach((q: any) => {
        const key = `${norm(q.question_text)}|${q.marks}|${(q.co||'').toString().toLowerCase()}|${String(q.btl||'').toString().toLowerCase()}|${q.part||''}|${q.sub||''}`;
        map1.set(key, q.id || `${q.baseNumber}.${q.sub||''}`);
      });
      generatedQuestions2.forEach((q: any) => {
        const key = `${norm(q.question_text)}|${q.marks}|${(q.co||'').toString().toLowerCase()}|${String(q.btl||'').toString().toLowerCase()}|${q.part||''}|${q.sub||''}`;
        map2.set(key, q.id || `${q.baseNumber}.${q.sub||''}`);
      });
      const dupKeys = new Set<string>();
      for (const k of map1.keys()) { if (map2.has(k) && k.split('|')[0] !== '') dupKeys.add(k); }
      const newD1 = new Set<string>();
      const newD2 = new Set<string>();
      generatedQuestions1.forEach((q: any) => {
        const k = `${norm(q.question_text)}|${q.marks}|${(q.co||'').toString().toLowerCase()}|${String(q.btl||'').toString().toLowerCase()}|${q.part||''}|${q.sub||''}`;
        if (dupKeys.has(k)) newD1.add(q.id || `${q.baseNumber}.${q.sub||''}`);
      });
      generatedQuestions2.forEach((q: any) => {
        const k = `${norm(q.question_text)}|${q.marks}|${(q.co||'').toString().toLowerCase()}|${String(q.btl||'').toString().toLowerCase()}|${q.part||''}|${q.sub||''}`;
        if (dupKeys.has(k)) newD2.add(q.id || `${q.baseNumber}.${q.sub||''}`);
      });
      setDups1(newD1);
      setDups2(newD2);
      if (dupKeys.size === 0) {
        setShowVerifiedPopup(true);
        // auto-hide popup after short delay
        setTimeout(() => setShowVerifiedPopup(false), 1800);
        toast({ title: "Verified", description: "No duplicates across copies", variant: "default" });
      } else {
        toast({ title: "Duplicates Found", description: `${dupKeys.size} duplicates detected between copies`, variant: "destructive" });
      }
    } finally {
      setChecking(false);
    }
  };

  // Replace a duplicate question with a random one honoring constraints
  const replaceDuplicate = (copy: 1 | 2, q: any) => {
    if (!lastTemplate || !lastVerifiedQuestions.length) {
      toast({ title: "Unavailable", description: "Cannot replace: context missing", variant: "destructive" });
      return;
    }
    const tpl = lastTemplate as any;
    const isPartA = (q.part || 'A') === 'A' || (q.baseNumber || 0) <= 10;
    const marksReq = isPartA ? ((tpl.sections||[]).find((s:any)=> (s.name||'').toLowerCase().includes('section a'))?.marksPerQuestion || q.marks) : q.marks;
    const coReq = ((q.co || q.course_outcomes || '') as string).toString().trim().toLowerCase();
    const btlReq = String(q.btl||'').replace(/BTL/i,'').trim();
    const typeReq = q.type;

    // pool honoring constraints and avoiding duplicate text across copies
    const otherCopy = copy === 1 ? generatedQuestions2 : generatedQuestions1;
    const otherNorms = new Set(otherCopy.map((x:any)=> norm(x.question_text)));
    const pool = lastVerifiedQuestions.filter((cand:any)=>{
      const co = ((cand.course_outcomes||'') as string).toString().trim().toLowerCase();
      const btl = String((cand as any).btl);
      const okCo = co === coReq;
      const okBtl = !btlReq || btl === btlReq;
      const okMarks = Number(cand.marks) === Number(marksReq);
      const okType = !typeReq || cand.type === typeReq;
      const notDupText = !otherNorms.has(norm(cand.question_text));
      return okCo && okBtl && okMarks && okType && notDupText;
    });
    if (pool.length === 0) {
      toast({ title: "No Replacement", description: "No suitable question found respecting BTL/CO/marks/type", variant: "destructive" });
      return;
    }
    const replacement = pool[Math.floor(Math.random()*pool.length)];
    const apply = (list:any[]) => list.map((x:any)=>{
      if ((x.id||`${x.baseNumber}.${x.sub||''}`) === (q.id||`${q.baseNumber}.${q.sub||''}`)) {
        const newQ = { ...replacement } as any;
        newQ.part = q.part;
        newQ.baseNumber = q.baseNumber;
        newQ.sub = q.sub;
        newQ.marks = q.marks;
        newQ.or = q.or;
        newQ.co = (newQ as any).course_outcomes;
        return newQ;
      }
      return x;
    });
    if (copy === 1) {
      setGeneratedQuestions1(apply(generatedQuestions1));
      // re-check duplicates for this item
      setDups1(prev=>{ const n=new Set(prev); n.delete(q.id||`${q.baseNumber}.${q.sub||''}`); return n; });
    } else {
      setGeneratedQuestions2(apply(generatedQuestions2));
      setDups2(prev=>{ const n=new Set(prev); n.delete(q.id||`${q.baseNumber}.${q.sub||''}`); return n; });
    }
  };

  const BANNER_IMAGE_URL = "/image.png"; // Use banner.jpg from public folder
  // Use backend URL from config
  const [activeBackend, setActiveBackend] = useState<string>(BACKEND_BASE_URL);

  const downloadPaper = async (questions: any[], label: string) => {
    const template = templates.find((t) => t.id === selectedTemplateId);
    // Use the selected question bank name for file naming
    const qnBankName = selectedQuestionBank || "Question_Bank";
    const banner = template?.name || "Question Paper";
    const totalMarks = template?.total_marks;
    const instructions = template?.instructions || "Answer all questions";

    if (downloadFormat === "word") {
      // Merge user-entered metadata with sensible defaults
      const meta = {
        dept: docMeta.dept || "CSE",
        cc: docMeta.cc || "CS3401",
        cn: docMeta.cn || banner,
        qpcode: docMeta.qpcode || "QP123",
        exam_title: docMeta.exam_title || banner,
        regulation: docMeta.regulation || "Regulation 2023",
        semester: docMeta.semester || "Second Semester",
      };
      // Map questions to backend format
      // Helper to convert image URL to data URL (base64)

      async function toDataUrl(url: string | null | undefined): Promise<string | null> {
        if (!url) return null;
        if (url.startsWith('data:image/')) return url;
        try {
          // Always fetch with credentials for Supabase or protected URLs
          const res = await fetch(url, { credentials: 'include' });
          if (!res.ok) return null;
          const blob = await res.blob();
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      }

      // Convert all images to data URLs before sending (prefer preview object-URLs)
      const mapped = await Promise.all(questions.map(async (q: any) => {
        // Prefer the preview object URL if available (generatedQuestions1/2 views)
        let src: string | null = q.image_url || null;
        if (questions === generatedQuestions1) src = (imageSrcs1 as any)[q.id] || src;
        else if (questions === generatedQuestions2) src = (imageSrcs2 as any)[q.id] || src;
        const ocrSelected = questions === generatedQuestions1
          ? Boolean(ocrSelections1[q.id])
          : Boolean(ocrSelections2[q.id]);
        return ({
        number: q.baseNumber,
        sub: q.sub || undefined,
        text: q.question_text,
        co: q.co || q.courseOutcome || 'CO1',
        btl: q.btl || 'BTL1',
        marks: q.marks,
        part: q.part || (q.baseNumber <= 10 ? 'A' : (q.baseNumber >= 16 ? 'C' : 'B')),
        or: !!q.or,
        image_url: await toDataUrl(src || null),
        image_ocr: ocrSelected,
      });
      }));
      // Prepare form data
      const formData = new FormData();
      formData.append("questions", JSON.stringify(mapped));
      // Include image data URLs for selected OCR to aid backend processing
      const ocrPayload: Record<string, string> = {};
      for (const q of questions) {
        const ocrSelected = questions === generatedQuestions1
          ? Boolean(ocrSelections1[q.id])
          : Boolean(ocrSelections2[q.id]);
        if (ocrSelected) {
          const src: string | null = (questions === generatedQuestions1)
            ? ((imageSrcs1 as any)[q.id] || q.image_url || null)
            : ((imageSrcs2 as any)[q.id] || q.image_url || null);
          const dataUrl = await toDataUrl(src || null);
          if (dataUrl) {
            ocrPayload[String(q.id || q.baseNumber)] = dataUrl;
          }
        }
      }
      formData.append("ocr_images", JSON.stringify(ocrPayload));
      Object.entries(meta).forEach(([k, v]) => formData.append(k, v));
      // Provide optional title image beside exam title (logo). Adjust path as needed.
      // Only send title_image_url if logo is present in public folder
      try {
        const origin = window.location?.origin || "";
        const logoPath = "/image.png";
        if (origin) {
          const url = origin + logoPath;
          const resp = await fetch(url, { method: 'HEAD' });
          if (resp.ok) {
            formData.append("title_image_url", url);
          }
        }
      } catch {}
      // Fetch docx from backend using the common config variable
      try {
        const url = `${BACKEND_BASE_URL}/api/template/generate-docx`;
        const res = await fetch(url, { method: 'POST', body: formData });
        if (res.ok) {
          const blob = await res.blob();
          const safeQnBank = (qnBankName || 'Question_Bank').replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
          saveAs(blob, `${safeQnBank}_${label.replace(/\s+/g,'_')}.docx`);
          setActiveBackend(BACKEND_BASE_URL);
          toast({ title: 'Downloaded', description: `DOCX (${label}) via ${BACKEND_BASE_URL}`, variant: 'default' });
        } else {
          toast({ title: 'Connection Error', description: `Backend error: ${res.status}`, variant: 'destructive' });
        }
      } catch (err) {
        toast({ title: 'Connection Error', description: `Failed to connect to backend.`, variant: 'destructive' });
        console.error('DOCX generation fetch failed', err);
      }
    } else if (downloadFormat === "excel") {
      // Banner as first row in Excel
      const wsData = [
        ["", "", "", "", "", ""],
        [{ t: "s", v: banner, s: { font: { bold: true, sz: 18 } } }],
        [`Total Marks: ${totalMarks}`],
        [`Instructions: ${instructions}`],
        [],
        ["No.", "Question", "Marks", "A", "B", "C", "D"],
        ...questions.map((q: any, idx: number) => [
          idx + 1,
          q.question_text,
          q.marks,
          q.options ? (q.options as any).A : "",
          q.options ? (q.options as any).B : "",
          q.options ? (q.options as any).C : "",
          q.options ? (q.options as any).D : "",
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Question Paper");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const safeQnBank = (qnBankName || 'Question_Bank').replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
      saveAs(new Blob([wbout], { type: "application/octet-stream" }), `${safeQnBank}_${label.replace(/\s+/g,'_')}.xlsx`);
    }
  };

  const downloadAnswerKey = (key: {questionNumber: number|string; answer: string}[], label: string) => {
    let content = `Answer Key - ${label}\n\n`;
    key.forEach(item => { content += `Q${item.questionNumber}: ${item.answer}\n`; });
    const blob = new Blob([content], { type: 'text/plain' });
    saveAs(blob, `answer_key_${label.replace(/\s+/g,'_')}.txt`);
  };

  // Pagination controls for questions
  const totalQuestionsPages = Math.ceil(totalQuestions / QUESTIONS_PAGE_SIZE) || 1;

  // Helper to select Part B questions by chapter
  function selectPartBQuestionsByChapter(questions: ExtendedQuestion[], chapterValue: string) {
    return questions.filter(q => String(q.chapter) === String(chapterValue) && q.part === 'B');
  }

  // When generating questions for Part B (11A-15A, 11B-15B)
  function buildPartBQuestions(allQuestions: ExtendedQuestion[]) {
    // Get all chapter 1 and chapter 2 questions for Part B
    const aQuestions = allQuestions.filter(q => q.part === 'B' && String(q.chapter) === '1');
    const bQuestions = allQuestions.filter(q => q.part === 'B' && String(q.chapter) === '2');
    const result: ExtendedQuestion[] = [];
    for (let i = 0; i < 5; i++) {
      // For each slot, take ith from chapter 1 for A, ith from chapter 2 for B
      result.push(aQuestions[i] ? { ...aQuestions[i], baseNumber: 11 + i, sub: 'a', part: 'B', chapter: '1' } : {
        baseNumber: 11 + i,
        sub: 'a',
        part: 'B',
        chapter: '1',
        correct_answer: '',
        created_at: '',
        difficulty: 'easy',
        id: '',
        marks: 0,
        options: {},
        question_text: '',
        status: 'pending',
        image_url: '',
        topic: '',
        type: 'objective',
        unit: '',
        updated_at: '',
        user_id: '',
        course_outcomes: '',
        title: '',
        answer_text: '',
        btl: 0
      });
      result.push(bQuestions[i] ? { ...bQuestions[i], baseNumber: 11 + i, sub: 'b', part: 'B', chapter: '2' } : {
        baseNumber: 11 + i,
        sub: 'b',
        part: 'B',
        chapter: '2',
        correct_answer: '',
        created_at: '',
        difficulty: 'easy',
        id: '',
        marks: 0,
        options: {},
        question_text: '',
        status: 'pending',
        image_url: '',
        topic: '',
        type: 'objective',
        unit: '',
        updated_at: '',
        user_id: '',
        course_outcomes: '',
        title: '',
        answer_text: '',
        btl: 0
      });
    }
    return result;
  }

  // Helper to build Part B questions for both copies
  function buildPartBQuestionsForAll(allQuestions: ExtendedQuestion[]) {
    // 11A-15A: chapter 1, 11B-15B: chapter 2
    const aQuestions = allQuestions.filter(q => q.part === 'B' && String(q.chapter) === '1');
    const bQuestions = allQuestions.filter(q => q.part === 'B' && String(q.chapter) === '2');
    // Pad to 5 each
    while (aQuestions.length < 5) aQuestions.push({} as ExtendedQuestion);
    while (bQuestions.length < 5) bQuestions.push({} as ExtendedQuestion);
    const result: ExtendedQuestion[] = [];
    for (let i = 0; i < 5; i++) {
      result.push({ ...aQuestions[i], baseNumber: 11 + i, sub: 'a', part: 'B', chapter: '1' });
      result.push({ ...bQuestions[i], baseNumber: 11 + i, sub: 'b', part: 'B', chapter: '2' });
    }
    return result;
  }

  // --- Main component render ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-primary">Auto Generate Question Paper</h1>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Debug panel: shows counts of Part B questions by chapter (helpful to verify DB tagging) */}
          {showDebugCounts ? (
            debugCounts ? (
              <div className="bg-yellow-50 border-yellow-200 border p-3 rounded">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold mb-1">Debug — Part B question counts</div>
                    <div className="text-xs">Total Part B: <span className="font-medium">{debugCounts.partBTotal}</span></div>
                    <div className="text-xs mt-1">By chapter: {Object.entries(debugCounts.chapterCounts).map(([ch, cnt]) => (
                      <span key={ch} className="mr-3">Ch {ch}: <strong>{cnt}</strong></span>
                    ))}</div>
                  </div>
                  <div>
                    <Button variant="ghost" onClick={() => setShowDebugCounts(false)}>Hide</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 border-yellow-200 border p-3 rounded flex items-center justify-between">
                <div className="text-sm">Debug counts not available yet.</div>
                <div><Button variant="ghost" onClick={() => setShowDebugCounts(false)}>Hide</Button></div>
              </div>
            )
          ) : (
            <div className="text-right">
              <Button variant="ghost" onClick={() => setShowDebugCounts(true)}>Show debug counts</Button>
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Generate Options</CardTitle>
              <CardDescription>Select a template and generate your question paper</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Question Bank</Label>
                <Input
                  placeholder="Search question bank titles..."
                  value={questionBankSearch}
                  onChange={e => setQuestionBankSearch(e.target.value)}
                  className="mb-2"
                />
                <Select value={selectedQuestionBank} onValueChange={setSelectedQuestionBank}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose question bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {questionBanks
                      .filter(t => t.toLowerCase().includes(questionBankSearch.toLowerCase()))
                      .map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    {questionBanks.length === 0 && (
                      <SelectItem disabled value="__none">No banks found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Select Template</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} ({template.total_marks} marks)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={generatePaper} className="w-full" disabled={!selectedTemplateId || !selectedQuestionBank}>
                Generate Question Paper
              </Button>
            </CardContent>
          </Card>
          {isGenerated && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Document Details</CardTitle>
                  <CardDescription>These values will be used in the generated Word document</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Department</Label>
                      <Select value={docMeta.dept} onValueChange={(val)=>setDocMeta(v=>({...v, dept: val}))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departmentOptions.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Course Code</Label>
                      <Input value={docMeta.cc} onChange={e=>setDocMeta(v=>({...v, cc: e.target.value}))} placeholder="e.g., CS3401" />
                    </div>
                    <div>
                      <Label>Course Name</Label>
                      <Input value={docMeta.cn || templates.find(t=>t.id===selectedTemplateId)?.name || ''} onChange={e=>setDocMeta(v=>({...v, cn: e.target.value}))} placeholder="e.g., Computer Architecture" />
                    </div>
                    <div>
                      <Label>QP Code</Label>
                      <Input value={docMeta.qpcode} onChange={e=>setDocMeta(v=>({...v, qpcode: e.target.value}))} placeholder="e.g., QP123" />
                    </div>
                    <div>
                      <Label>Exam Title</Label>
                      <Select
                        value={docMeta.exam_title}
                        onValueChange={val => setDocMeta(v => ({ ...v, exam_title: val }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select exam title" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CIA I">CIA I</SelectItem>
                          <SelectItem value="CIA II">CIA II</SelectItem>
                          <SelectItem value="MODEL EXAM">Model Examination</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Regulation</Label>
                      <Input value={docMeta.regulation} onChange={e=>setDocMeta(v=>({...v, regulation: e.target.value}))} placeholder="e.g., Regulation 2023" />
                    </div>
                    <div>
                      <Label>Semester</Label>
                      <Select value={docMeta.semester} onValueChange={val => setDocMeta(v => ({ ...v, semester: val }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select semester" />
                        </SelectTrigger>
                        <SelectContent>
                          {semesterOptions.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {isGenerated && (
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={checkDuplicates} disabled={checking}>
                {checking ? 'Checking…' : 'Check Duplicate'}
              </Button>
              <Button variant="outline" onClick={()=>setExpandedOpen(true)}>Expand</Button>
            </div>
          )}
            

          {isGenerated && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Copy 1 */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Copy 1</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-2">Preview</p>
                        <p className="font-semibold mb-2">Total Questions: {generatedQuestions1.length}</p>
                        <p className="text-sm">Objective: {generatedQuestions1.filter((q:any)=>q.type==='objective').length} | Descriptive: {generatedQuestions1.filter((q:any)=> q.type==='descriptive' || q.type==='Part_C').length} {generatedQuestions1.some((q:any)=>q.type==='Part_C') && <span className="ml-2 text-xs text-blue-700">(+Part C)</span>}</p>
                      </div>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {generatedQuestions1.map((q:any, idx:number) => (
                          <div key={idx} className={`border rounded-lg p-4 ${q._insufficient ? 'bg-red-50 border-red-400' : ''} ${dups1.has(q.id||`${q.baseNumber}.${q.sub||''}`) ? 'bg-yellow-50 border-yellow-400' : ''}`}>
                            <div className="font-semibold mb-2 flex flex-col gap-2">
                              <span>
                                Q{q.baseNumber}{q.sub?'.'+q.sub:''}. {q.question_text || <span className="italic text-red-600">Insufficient question for {q._insufficientCo || 'CO'}{q._insufficientType ? ` (${q._insufficientType})` : ''}{q._insufficientBtl ? ` (BTL ${q._insufficientBtl})` : ''}</span>} <span className="text-sm text-muted-foreground">({q.marks} marks{q.btl ? ` • BTL ${q.btl}` : ''}{q.chapter ? ` • Chapter ${q.chapter}` : ''})</span>{q.part==='B' && q.sub==='a' && generatedQuestions1.some((x:any)=>x.baseNumber===q.baseNumber && x.sub==='b') && <span className="ml-2 text-xs font-semibold">(Pair)</span>}
                                {/* Show Type for 16th question (Part C) */}
                                {q.baseNumber === 16 && q.type && (
                                  <span className="text-xs text-blue-700 font-bold">Type: {q.type === 'Part_C' ? 'Part C' : q.type}</span>
                                )}
                              </span>
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" variant="outline" onClick={()=>openManualPick(1, idx)}>Pick Manually</Button>
                              </div>
                              {(imageSrcs1[q.id] || q.image_url) ? (
                                <div>
                                  <img src={imageSrcs1[q.id] || q.image_url} alt="Question" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 4 }} />
                                  <div className="mt-2 flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(ocrSelections1[q.id])}
                                      onChange={e => setOcrSelections1(prev => ({ ...prev, [q.id]: e.target.checked }))}
                                      id={`ocr-c1-${q.id || idx}`}
                                    />
                                    <Label htmlFor={`ocr-c1-${q.id || idx}`} className="cursor-pointer text-xs">Convert image to text in DOCX</Label>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            {q.options && (
                              <div className="ml-4 space-y-1 text-sm">
                                <p>A) {(q.options as any).A}</p>
                                <p>B) {(q.options as any).B}</p>
                                <p>C) {(q.options as any).C}</p>
                                <p>D) {(q.options as any).D}</p>
                              </div>
                            )}
                            {q.or && <p className="text-center text-xs font-semibold mt-2">(OR)</p>}
                            {dups1.has(q.id||`${q.baseNumber}.${q.sub||''}`) && (
                              <div className="mt-3 flex justify-end">
                                <Button size="sm" variant="outline" onClick={()=>replaceDuplicate(1, q)}>Replace with random</Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-4">
                        <Label>Download Format</Label>
                        <Select value={downloadFormat} onValueChange={v=>setDownloadFormat(v as 'word'|'excel')}>
                          <SelectTrigger className="w-40"><SelectValue placeholder="Select format" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="word">Word</SelectItem>
                            <SelectItem value="excel">Excel</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={()=>downloadPaper(generatedQuestions1, 'Copy 1')}><Download className="w-4 h-4 mr-2" />Download</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              {/* Copy 2 */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Copy 2</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-2">Preview</p>
                        <p className="font-semibold mb-2">Total Questions: {generatedQuestions2.length}</p>
                        <p className="text-sm">Objective: {generatedQuestions2.filter((q:any)=>q.type==='objective').length} | Descriptive: {generatedQuestions2.filter((q:any)=> q.type==='descriptive' || q.type==='Part_C').length} {generatedQuestions2.some((q:any)=>q.type==='Part_C') && <span className="ml-2 text-xs text-blue-700">(+Part C)</span>}</p>
                      </div>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {generatedQuestions2.map((q:any, idx:number) => (
                          <div key={idx} className={`border rounded-lg p-4 ${q._insufficient ? 'bg-red-50 border-red-400' : ''} ${dups2.has(q.id||`${q.baseNumber}.${q.sub||''}`) ? 'bg-yellow-50 border-yellow-400' : ''}`}>
                            <div className="font-semibold mb-2 flex flex-col gap-2">
                              <span>
                                Q{q.baseNumber}{q.sub?'.'+q.sub:''}. {q.question_text || <span className="italic text-red-600">Insufficient question for {q._insufficientCo || 'CO'}{q._insufficientType ? ` (${q._insufficientType})` : ''}{q._insufficientBtl ? ` (BTL ${q._insufficientBtl})` : ''}</span>} <span className="text-sm text-muted-foreground">({q.marks} marks{q.btl ? ` • BTL ${q.btl}` : ''}{q.chapter ? ` • Chapter ${q.chapter}` : ''})</span>{q.part==='B' && q.sub==='a' && generatedQuestions2.some((x:any)=>x.baseNumber===q.baseNumber && x.sub==='b') && <span className="ml-2 text-xs font-semibold">(Pair)</span>}
                              </span>
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" variant="outline" onClick={()=>openManualPick(2, idx)}>Pick Manually</Button>
                              </div>
                                    {/* Manual Pick Dialog */}
                                    <Dialog open={manualPick.open} onOpenChange={v=>setManualPick(p=>({...p, open:v}))}>
                                      <DialogContent className="max-w-[95vw] w-[1200px]">
                                        <DialogHeader>
                                          <DialogTitle>Pick Question from Bank</DialogTitle>
                                        </DialogHeader>
                                        {manualPickLoading ? (
                                          <div className="py-8 text-center">Loading…</div>
                                        ) : (
                                          <>
                                            <div className="flex items-center gap-2 mb-2">
                                              <label className="text-xs font-semibold">Filter by Type:</label>
                                              <select
                                                className="border rounded px-2 py-1 text-xs"
                                                value={manualPickType}
                                                onChange={e => setManualPickType(e.target.value)}
                                              >
                                                <option value="">All</option>
                                                {[...new Set(manualPickList.map(q => q.type || q.TYPE || q.type_letter || q.excel_type).filter(Boolean))].map(type => (
                                                  <option key={type} value={type}>{type}</option>
                                                ))}
                                              </select>
                                            </div>
                                            <div className="max-h-[70vh] overflow-auto">
                                              <table className="w-full text-xs border">
                                                <thead>
                                                  <tr className="bg-muted">
                                                    <th className="p-2 border">Qn No.</th>
                                                    <th className="p-2 border">Text</th>
                                                    <th className="p-2 border">CO</th>
                                                    <th className="p-2 border">Type</th>
                                                    <th className="p-2 border">BTL</th>
                                                    <th className="p-2 border">Chapter</th>
                                                    <th className="p-2 border">Marks</th>
                                                    <th className="p-2 border">Image</th>
                                                    <th className="p-2 border"></th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {manualPickList
                                                    .filter(q => !manualPickType || (q.type || q.TYPE || q.type_letter || q.excel_type) === manualPickType)
                                                    .map((q, i) => (
                                                      <tr key={q.id || i} className="border-b hover:bg-accent">
                                                        <td className="p-2 border">{
                                                          Number.isInteger(q.qn_number) ? q.qn_number :
                                                          Number.isInteger(q.qn_no) ? q.qn_no :
                                                          Number.isInteger(q.number) ? q.number :
                                                          (Number.isInteger(Number(q.id)) && !isNaN(Number(q.id))) ? Number(q.id) :
                                                          i+1
                                                        }</td>
                                                        <td className="p-2 border whitespace-pre-wrap break-words text-sm" style={{minWidth: 400}}>
                                                          {String(q.question_text || '').split(/\n+/).map((ln, idx) => (
                                                            <p key={idx} className="mb-1">{ln}</p>
                                                          ))}
                                                        </td>
                                                        <td className="p-2 border">{getCoText(q)}</td>
                                                        <td className="p-2 border">{q.type || q.TYPE || q.type_letter || q.excel_type}</td>
                                                        <td className="p-2 border">{q.btl}</td>
                                                        <td className="p-2 border">{q.chapter || '-'}</td>
                                                        <td className="p-2 border">{q.marks}</td>
                                                        <td className="p-2 border">
                                                          {q.image_url ? (
                                                            <img src={q.image_url} alt="Qn" style={{ maxWidth: 60, maxHeight: 60, borderRadius: 4 }} />
                                                          ) : null}
                                                        </td>
                                                        <td className="p-2 border"><Button size="sm" onClick={()=>pickManualQuestion(q)}>Pick</Button></td>
                                                      </tr>
                                                    ))}
                                                  {manualPickList.filter(q => !manualPickType || (q.type || q.TYPE || q.excel_type) === manualPickType).length === 0 && (
                                                    <tr><td colSpan={9} className="text-center p-4">No questions found in bank</td></tr>
                                                  )}
                                                </tbody>
                                              </table>
                                            </div>
                                          </>
                                        )}
                                      </DialogContent>
                                    </Dialog>
                              {q.baseNumber === 16 && q.type && (
                                <span className="text-xs text-blue-700 font-bold">Type: {q.type === 'Part_C' ? 'Part C' : q.type}</span>
                              )}
                              {(imageSrcs2[q.id] || q.image_url) ? (
                                <div>
                                  <img src={imageSrcs2[q.id] || q.image_url} alt="Question" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 4 }} />
                                  <div className="mt-2 flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(ocrSelections2[q.id])}
                                      onChange={e => setOcrSelections2(prev => ({ ...prev, [q.id]: e.target.checked }))}
                                      id={`ocr-c2-${q.id || idx}`}
                                    />
                                    <Label htmlFor={`ocr-c2-${q.id || idx}`} className="cursor-pointer text-xs">Convert image to text in DOCX</Label>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            {q.options && (
                              <div className="ml-4 space-y-1 text-sm">
                                <p>A) {(q.options as any).A}</p>
                                <p>B) {(q.options as any).B}</p>
                                <p>C) {(q.options as any).C}</p>
                                <p>D) {(q.options as any).D}</p>
                              </div>
                            )}
                            {q.or && <p className="text-center text-xs font-semibold mt-2">(OR)</p>}
                            {dups2.has(q.id||`${q.baseNumber}.${q.sub||''}`) && (
                              <div className="mt-3 flex justify-end">
                                <Button size="sm" variant="outline" onClick={()=>replaceDuplicate(2, q)}>Replace with random</Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-4">
                        <Label>Download Format</Label>
                        <Select value={downloadFormat} onValueChange={v=>setDownloadFormat(v as 'word'|'excel')}>
                          <SelectTrigger className="w-40"><SelectValue placeholder="Select format" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="word">Word</SelectItem>
                            <SelectItem value="excel">Excel</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={()=>downloadPaper(generatedQuestions2, 'Copy 2')}><Download className="w-4 h-4 mr-2" />Download</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
          {/* Pagination controls */}
          {generatedQuestions1.length > 0 && (
  <div className="flex justify-center items-center gap-2 mt-4">
    <Button variant="outline" size="sm" onClick={() => setQuestionsPage(p => Math.max(1, p - 1))} disabled={questionsPage === 1}>Prev</Button>
    <span>Page {questionsPage} of {totalQuestionsPages}</span>
    <Button variant="outline" size="sm" onClick={() => setQuestionsPage(p => Math.min(totalQuestionsPages, p + 1))} disabled={questionsPage === totalQuestionsPages}>Next</Button>
  </div>
)}

        </div>
      </main>
      {/* Full-screen preview dialog */}
      <Dialog open={expandedOpen} onOpenChange={setExpandedOpen}>
        <DialogContent className="max-w-[95vw] w-[1200px]">
          <DialogHeader>
            <DialogTitle>Full Preview</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end mb-3">
            <Button variant="secondary" onClick={checkDuplicates} disabled={checking}>
              {checking ? 'Checking…' : 'Check Duplicate'}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-auto">
            {/* Copy 1 preview */}
            <div className="space-y-3">
              <div className="bg-muted p-3 rounded">
                <p className="font-semibold">Copy 1 • Total: {generatedQuestions1.length}</p>
                <p className="text-sm">Objective: {generatedQuestions1.filter((q:any)=>q.type==='objective').length} | Descriptive: {generatedQuestions1.filter((q:any)=> q.type==='descriptive' || q.type==='Part_C').length}</p>
              </div>
              <div className="space-y-2">
                {generatedQuestions1.map((q:any, idx:number)=> {
                  const isDup = dups1.has(q.id||`${q.baseNumber}.${q.sub||''}`);
                  return (
                  <div key={`c1-${idx}`} className={`border rounded p-3 ${isDup ? 'bg-yellow-50 border-yellow-400' : ''}`}>
                    <div className="text-sm">
                      Q{q.baseNumber}{q.sub?'.'+q.sub:''}. {q.question_text || <span className="italic text-red-600">(missing)</span>} <span className="text-xs text-muted-foreground">({q.marks} marks{q.btl?` • BTL ${q.btl}`:''}{q.chapter?` • Chapter ${q.chapter}`:''})</span>
                    </div>
                    {(imageSrcs1[q.id] || q.image_url) && (
                      <img src={imageSrcs1[q.id] || q.image_url} alt="Question" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 4, marginTop: 8 }} />
                    )}
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={()=>openManualPick(1, idx)}>Pick Manually</Button>
                      {isDup && (
                        <Button size="sm" variant="outline" onClick={()=>replaceDuplicate(1, q)}>Replace with random</Button>
                      )}
                    </div>
                  </div>
                )})}
              </div>
            </div>
            {/* Copy 2 preview */}
            <div className="space-y-3">
              <div className="bg-muted p-3 rounded">
                <p className="font-semibold">Copy 2 • Total: {generatedQuestions2.length}</p>
                <p className="text-sm">Objective: {generatedQuestions2.filter((q:any)=>q.type==='objective').length} | Descriptive: {generatedQuestions2.filter((q:any)=> q.type==='descriptive' || q.type==='Part_C').length}</p>
              </div>
              <div className="space-y-2">
                {generatedQuestions2.map((q:any, idx:number)=> {
                  const isDup = dups2.has(q.id||`${q.baseNumber}.${q.sub||''}`);
                  return (
                  <div key={`c2-${idx}`} className={`border rounded p-3 ${isDup ? 'bg-yellow-50 border-yellow-400' : ''}`}>
                    <div className="text-sm">
                      Q{q.baseNumber}{q.sub?'.'+q.sub:''}. {q.question_text || <span className="italic text-red-600">(missing)</span>} <span className="text-xs text-muted-foreground">({q.marks} marks{q.btl?` • BTL ${q.btl}`:''}{q.chapter?` • Chapter ${q.chapter}`:''})</span>
                    </div>
                    {(imageSrcs2[q.id] || q.image_url) && (
                      <img src={imageSrcs2[q.id] || q.image_url} alt="Question" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 4, marginTop: 8 }} />
                    )}
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={()=>openManualPick(2, idx)}>Pick Manually</Button>
                      {isDup && (
                        <Button size="sm" variant="outline" onClick={()=>replaceDuplicate(2, q)}>Replace with random</Button>
                      )}
                    </div>
                  </div>
                )})}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {showVerifiedPopup && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-green-600/90 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-[fadeIn_.2s_ease-out]">
            <span className="w-5 h-5 rounded-full bg-white text-green-600 flex items-center justify-center">✓</span>
            <span>No duplicates detected</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneratePaper;
