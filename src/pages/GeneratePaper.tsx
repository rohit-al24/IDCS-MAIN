// --- Image preview logic (copied from VerifyQuestions) ---
import { useRef } from "react";

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
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download, FileText, Key } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { Document, Packer, Paragraph, TextRun, ImageRun } from "docx";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

type Template = Tables<"templates">;
type Question = Tables<"question_bank">;

const GeneratePaper = () => {
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

  // --- Image hooks must be at the top level ---
  const imageSrcs1 = useQuestionImages(generatedQuestions1);
  const imageSrcs2 = useQuestionImages(generatedQuestions2);

  useEffect(() => {
    fetchTemplates();
    fetchQuestionBanks();
  }, []);

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
          const coMatch = qco === coNorm;
          const btlMatch = !config.btl || config.btl === 'random' || (String((q as any).btl) === String(config.btl).replace(/BTL/,'') ) || (String((q as any).btl) === String(config.btl));
          const notUsed = !pickedIds.has(q.id);
          const marksMatch = Number(q.marks) === Number(config.marks || 16);
          return typeMatch && coMatch && btlMatch && notUsed && marksMatch;
        });
        let qa = null, qb = null;
        if (pool.length >= 2) {
          qa = pool[Math.floor(Math.random()*pool.length)];
          const qaBTL = String((qa as any).btl);
          const poolB = pool.filter(q => q.id !== qa.id && String((q as any).btl) === qaBTL);
          if (poolB.length > 0) {
            qb = poolB[Math.floor(Math.random()*poolB.length)];
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
          } else {
            // Only one question found, insert placeholder for B
            (qa as any).co = (qa as any).course_outcomes;
            (qa as any).part = 'B';
            (qa as any).baseNumber = baseNumber;
            (qa as any).sub = 'a';
            (qa as any).or = false;
            (qa as any).marks = config.marks || 16;
            generated.push(qa as any);
            // Insert empty placeholder for B
            generated.push({ part: 'B', baseNumber, sub: 'b', or: true, marks: config.marks || 16, co: '', btl: '', question_text: '', _insufficient: true, _insufficientCo: config.co, _insufficientBtl: config.btl } as any);
            partBMisses.push({ co: config.co, btl: config.btl, baseNumber });
          }
        } else if (pool.length === 1) {
          qa = pool[0];
          (qa as any).co = (qa as any).course_outcomes;
          (qa as any).part = 'B';
          (qa as any).baseNumber = baseNumber;
          (qa as any).sub = 'a';
          (qa as any).or = false;
          (qa as any).marks = config.marks || 16;
          generated.push(qa as any);
          // Insert empty placeholder for B
          generated.push({ part: 'B', baseNumber, sub: 'b', or: true, marks: config.marks || 16, co: '', btl: '', question_text: '', _insufficient: true, _insufficientCo: config.co, _insufficientBtl: config.btl } as any);
          partBMisses.push({ co: config.co, btl: config.btl, baseNumber });
        } else {
          // Insert empty placeholders for both A and B
          generated.push({ part: 'B', baseNumber, sub: 'a', or: false, marks: config.marks || 16, co: '', btl: '', question_text: '', _insufficient: true, _insufficientCo: config.co, _insufficientBtl: config.btl } as any);
          generated.push({ part: 'B', baseNumber, sub: 'b', or: true, marks: config.marks || 16, co: '', btl: '', question_text: '', _insufficient: true, _insufficientCo: config.co, _insufficientBtl: config.btl } as any);
          partBMisses.push({ co: config.co, btl: config.btl, baseNumber });
        }
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

  const BANNER_IMAGE_URL = "/banner.jpg"; // Use banner.jpg from public folder
  // Backend URL with intelligent fallbacks (env -> 4000 -> 8000)
  const envBackend = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
  const sanitizeBase = (raw?: string) => {
    if (!raw) return '';
    // If user entered just a port like ':4000' normalize
    if (/^:?\d+$/.test(raw)) return `http://localhost${raw.startsWith(':') ? raw : ':' + raw}`;
    if (!/^https?:\/\//i.test(raw)) return `http://${raw}`; // prefix scheme if missing
    return raw.replace(/\/$/, '');
  };
  const primaryBase = sanitizeBase(envBackend) || 'https://idcs-main-p9el.onrender.com';
  const candidateBases = [primaryBase, 'http://localhost:8000'];
  const [activeBackend, setActiveBackend] = useState<string>(primaryBase);

  const downloadPaper = async (questions: any[], label: string) => {
    const template = templates.find((t) => t.id === selectedTemplateId);
    // Use the selected question bank name for file naming
    const qnBankName = selectedQuestionBank || "Question_Bank";
    const banner = template?.name || "Question Paper";
    const totalMarks = template?.total_marks;
    const instructions = template?.instructions || "Answer all questions";

    if (downloadFormat === "word") {
      // Use sensible defaults for metadata
      const meta = {
        dept: "CSE", // or prompt user for department
        cc: "CS3401", // or prompt user for course code
        cn: banner, // or prompt user for course name
        qpcode: "QP123", // or prompt user for code
        exam_title: banner,
        regulation: "Regulation 2024",
        semester: "Second Semester",
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
        return ({
        number: q.baseNumber,
        sub: q.sub || undefined,
        text: q.question_text,
        co: q.co || q.courseOutcome || 'CO1',
        btl: q.btl || 'BTL1',
        marks: q.marks,
        part: q.part || (q.baseNumber <= 10 ? 'A' : 'B'),
        or: !!q.or,
        image_url: await toDataUrl(src || null),
      });
      }));
      // Prepare form data
      const formData = new FormData();
      formData.append("questions", JSON.stringify(mapped));
      Object.entries(meta).forEach(([k, v]) => formData.append(k, v));
      // Fetch docx from backend with error handling
      // Attempt fetch with fallbacks
      let success = false; let lastErr: any = null;
      for (const base of candidateBases) {
        try {
          const url = `${base}/api/template/generate-docx`;
          const res = await fetch(url, { method: 'POST', body: formData });
          if (res.ok) {
            const blob = await res.blob();
            // Use the question bank name as the file name
            const safeQnBank = (qnBankName || 'Question_Bank').replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
            saveAs(blob, `${safeQnBank}_${label.replace(/\s+/g,'_')}.docx`);
            if (base !== activeBackend) setActiveBackend(base);
            toast({ title: 'Downloaded', description: `DOCX (${label}) via ${base}`, variant: 'default' });
            success = true; break;
          } else {
            lastErr = new Error(`Status ${res.status}`);
          }
        } catch (e) { lastErr = e; }
      }
      if (!success) {
        toast({ title: 'Connection Error', description: `Failed all backend attempts (${candidateBases.join(', ')}). Ensure server running with CORS enabled.`, variant: 'destructive' });
        console.error('DOCX generation fetch failed', lastErr);
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
                        <p className="text-sm">Objective: {generatedQuestions1.filter((q:any)=>q.type==='objective').length} | Descriptive: {generatedQuestions1.filter((q:any)=>q.type==='descriptive').length}</p>
                      </div>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {generatedQuestions1.map((q:any, idx:number) => (
                          <div key={idx} className={`border rounded-lg p-4 ${q._insufficient ? 'bg-red-50 border-red-400' : ''}`}>
                            <div className="font-semibold mb-2 flex flex-col gap-2">
                              <span>
                                Q{q.baseNumber}{q.sub?'.'+q.sub:''}. {q.question_text || <span className="italic text-red-600">Insufficient question for {q._insufficientCo || 'CO'}{q._insufficientType ? ` (${q._insufficientType})` : ''}{q._insufficientBtl ? ` (BTL ${q._insufficientBtl})` : ''}</span>} <span className="text-sm text-muted-foreground">({q.marks} marks)</span>{q.part==='B' && q.sub==='a' && generatedQuestions1.some((x:any)=>x.baseNumber===q.baseNumber && x.sub==='b') && <span className="ml-2 text-xs font-semibold">(Pair)</span>}
                              </span>
                              {(imageSrcs1[q.id] || q.image_url) ? (
                                <img src={imageSrcs1[q.id] || q.image_url} alt="Question" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 4 }} />
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
                        <Button variant="outline" onClick={()=>downloadAnswerKey(answerKey1, 'Copy 1')}><Key className="w-4 h-4 mr-2" />Answer Key</Button>
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
                        <p className="text-sm">Objective: {generatedQuestions2.filter((q:any)=>q.type==='objective').length} | Descriptive: {generatedQuestions2.filter((q:any)=>q.type==='descriptive').length}</p>
                      </div>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {generatedQuestions2.map((q:any, idx:number) => (
                          <div key={idx} className={`border rounded-lg p-4 ${q._insufficient ? 'bg-red-50 border-red-400' : ''}`}>
                            <div className="font-semibold mb-2 flex flex-col gap-2">
                              <span>
                                Q{q.baseNumber}{q.sub?'.'+q.sub:''}. {q.question_text || <span className="italic text-red-600">Insufficient question for {q._insufficientCo || 'CO'}{q._insufficientType ? ` (${q._insufficientType})` : ''}{q._insufficientBtl ? ` (BTL ${q._insufficientBtl})` : ''}</span>} <span className="text-sm text-muted-foreground">({q.marks} marks)</span>{q.part==='B' && q.sub==='a' && generatedQuestions2.some((x:any)=>x.baseNumber===q.baseNumber && x.sub==='b') && <span className="ml-2 text-xs font-semibold">(Pair)</span>}
                              </span>
                              {(imageSrcs2[q.id] || q.image_url) ? (
                                <img src={imageSrcs2[q.id] || q.image_url} alt="Question" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 4 }} />
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
                        <Button variant="outline" onClick={()=>downloadAnswerKey(answerKey2, 'Copy 2')}><Key className="w-4 h-4 mr-2" />Answer Key</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default GeneratePaper;
