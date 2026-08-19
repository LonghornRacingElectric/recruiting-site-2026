"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import Link from "next/link";
import posthog from "posthog-js";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { PDFDocument } from "pdf-lib";
import { storage } from "@/lib/firebase/client";
import { Team } from "@/lib/models/User";
import { Application, ApplicationStatus } from "@/lib/models/Application";
import { TEAM_SYSTEMS, TEAM_INFO } from "@/lib/models/teamQuestions";
import { isNamedCommonField } from "@/lib/utils/formAnswers";
import { BRAND_TEAM_COLORS, getBrandTeamInk } from "@/lib/teamColors";
import { ApplicationQuestion, RecruitingStep } from "@/lib/models/Config";
import { routes } from "@/lib/routes";
import { useApplications } from "@/hooks/useApplications";
import ApplicationsNotOpenNotice from "@/components/ApplicationsNotOpenNotice";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  Upload,
  FileText,
  ExternalLink,
  X,
  Save,
  Send,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

// The form's accent colour. Uses the brand-book team ambers so the apply
// flow matches the team's colour on the public site.
const TEAM_CSS_COLORS = BRAND_TEAM_COLORS;

const optionStyle = { backgroundColor: "var(--pub-menu-bg)", color: "var(--pub-text-strong)" };

// Local storage caching for questions
const QUESTIONS_CACHE_KEY = "lhr_app_questions_cache";
const QUESTIONS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Debounce helper
function debounce<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Portfolio upload limits. Intentionally looser than the resume: any creative
// work counts, there is no page limit, and the size cap is 5x the resume's.
const PORTFOLIO_MAX_MB = 25;
const PORTFOLIO_MAX_BYTES = PORTFOLIO_MAX_MB * 1024 * 1024;
const PORTFOLIO_ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/zip",
  "application/x-zip-compressed",
];

// Rank styling for the three preferred-system slots. Deliberately independent
// of the team accent so the three slots stay distinguishable at a glance.
// Text/border colours come from theme-aware tokens (globals.css).
const RANK_LABELS = ["1st choice", "2nd choice", "3rd choice"];

const RANK_COLORS = [
  { solid: "#FFB526", on: "#142530", bg: "rgba(255,181,38,0.10)", border: "var(--rank1-border)", text: "var(--rank1-ink)" },
  { solid: "#8b5cf6", on: "#fff", bg: "rgba(139,92,246,0.10)", border: "var(--rank2-border)", text: "var(--rank2-ink)" },
  { solid: "#38bdf8", on: "#142530", bg: "rgba(56,189,248,0.10)", border: "var(--rank3-border)", text: "var(--rank3-ink)" },
];

// Word count helper
function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

interface FormData {
  whyJoin: string;
  relevantExperience: string;
  availability: string;
  resumeUrl: string;
  portfolioUrl: string;
  preferredSystems: string[];
  graduationYear: string;
  major: string;
  teamQuestions: Record<string, string>;
  // Answers to admin-added common questions, keyed by question id.
  customAnswers: Record<string, string>;
}

export default function TeamApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const { recruitingStep, isLoading: stepLoading } = useApplications();
  const teamParam = (params.team as string)?.toLowerCase();

  // Validate team parameter
  const team = Object.values(Team).find(
    (t) => t.toLowerCase() === teamParam
  ) as Team | undefined;

  const teamInfo = TEAM_INFO.find((t) => t.team === team);
  const systemOptions = team ? TEAM_SYSTEMS[team] : [];
  const teamAccent = team ? (TEAM_CSS_COLORS[team] || "var(--lhr-blue)") : "var(--lhr-blue)";
  // Theme-aware readable version of the accent for text (amber fails on light).
  const teamInk = team ? getBrandTeamInk(team) : "var(--pub-heading-accent)";

  // Dynamic questions from API
  const [commonQuestions, setCommonQuestions] = useState<ApplicationQuestion[]>([]);
  const [teamQuestions, setTeamQuestions] = useState<ApplicationQuestion[]>([]);
  // Extra questions that only apply if a given system is one of the applicant's
  // picks — keyed by system name (e.g. "Operations").
  const [systemQuestions, setSystemQuestions] = useState<Record<string, ApplicationQuestion[]>>({});
  const [questionsLoading, setQuestionsLoading] = useState(true);

  // State
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // File upload state
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [portfolioProgress, setPortfolioProgress] = useState<number | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<FormData>({
    whyJoin: "",
    relevantExperience: "",
    availability: "",
    resumeUrl: "",
    portfolioUrl: "",
    preferredSystems: [],
    graduationYear: "",
    major: "",
    teamQuestions: {},
    customAnswers: {},
  });

  // Fetch questions from API
  useEffect(() => {
    if (!team) return;

    let isCacheFresh = false;

    // Load from cache first
    const cached = localStorage.getItem(`${QUESTIONS_CACHE_KEY}_${team}`);
    if (cached) {
      try {
        const { common, teamQ, sysQ, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < QUESTIONS_CACHE_TTL) {
          setCommonQuestions(common);
          setTeamQuestions(teamQ);
          // sysQ is absent from caches written before system questions were
          // rendered; those entries expire within the TTL.
          setSystemQuestions(sysQ || {});
          setQuestionsLoading(false);
          isCacheFresh = true;
          console.log(`[Cache HIT] Using fresh questions for ${team} (skipping sync)`);
        }
      } catch (e) {
        console.error("Failed to parse cached questions", e);
      }
    }

    // Only fetch if cache is missing or stale
    if (isCacheFresh) return;

    async function fetchQuestions() {
      try {
        const res = await fetch(`/api/questions?team=${team}`);
        if (res.ok) {
          const data = await res.json();
          setCommonQuestions(data.commonQuestions || []);
          setTeamQuestions(data.teamQuestions || []);
          setSystemQuestions(data.systemQuestions || {});

          // Update cache
          localStorage.setItem(`${QUESTIONS_CACHE_KEY}_${team}`, JSON.stringify({
            common: data.commonQuestions,
            teamQ: data.teamQuestions,
            sysQ: data.systemQuestions,
            timestamp: Date.now()
          }));
        }
      } catch (err) {
        console.error("Failed to fetch questions:", err);
      } finally {
        setQuestionsLoading(false);
      }
    }

    fetchQuestions();
  }, [team]);

  // Fetch or create application
  useEffect(() => {
    if (!team) return;

    async function fetchOrCreateApplication() {
      try {
        // First try to create (will return existing if it exists)
        const createRes = await fetch("/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team }),
        });

        if (!createRes.ok) {
          throw new Error("Failed to create/fetch application");
        }

        const { application: app } = await createRes.json();
        setApplication(app);

        // Populate form with existing data
        if (app.formData) {
          setFormData({
            whyJoin: app.formData.whyJoin || "",
            relevantExperience: app.formData.relevantExperience || "",
            availability: app.formData.availability || "",
            resumeUrl: app.formData.resumeUrl || "",
            portfolioUrl: app.formData.portfolioUrl || "",
            preferredSystems: app.preferredSystems || [],
            graduationYear: app.formData.graduationYear || "",
            major: app.formData.major || "",
            teamQuestions: app.formData.teamQuestions || {},
            customAnswers: app.formData.customAnswers || {},
          });
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load application. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    fetchOrCreateApplication();
  }, [team]);

  // Helper to clean trailing commas and spaces when saving
  const cleanString = (str: string) => (str || "").replace(/[\s,]+$/, "");

  // Save form data to API
  const saveFormData = useCallback(
    async (data: FormData) => {
      if (!application) return;

      setSaveStatus("saving");
      
      const cleanedTeamQuestions: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.teamQuestions)) {
        cleanedTeamQuestions[k] = cleanString(v);
      }

      const cleanedCustomAnswers: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.customAnswers)) {
        cleanedCustomAnswers[k] = cleanString(v);
      }

      try {
        const res = await fetch(`/api/applications/${application.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formData: {
              whyJoin: cleanString(data.whyJoin),
              relevantExperience: cleanString(data.relevantExperience),
              availability: cleanString(data.availability),
              resumeUrl: data.resumeUrl,
              portfolioUrl: data.portfolioUrl,
              graduationYear: data.graduationYear,
              major: cleanString(data.major),
              teamQuestions: cleanedTeamQuestions,
              customAnswers: cleanedCustomAnswers,
            },
            preferredSystems: data.preferredSystems.length > 0 ? data.preferredSystems : undefined,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to save");
        }

        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (err) {
        console.error(err);
        setSaveStatus("error");
      }
    },
    [application]
  );

  // Debounced save
  const debouncedSave = useCallback(
    debounce((data: FormData) => saveFormData(data), 1500),
    [saveFormData]
  );

  const isEditingSubmitted = application?.status === ApplicationStatus.SUBMITTED;

  // System questions for the systems this applicant actually ranked, in rank
  // order. Deselecting a system hides its questions (previous answers are kept
  // but no longer required).
  const activeSystemQuestions = formData.preferredSystems
    .map((system) => ({ system, questions: systemQuestions[system] || [] }))
    .filter(({ questions }) => questions.length > 0);

  // Answers to questions with no named field — system questions and any common
  // question added through the admin UI both land here.
  const handleCustomAnswerChange = (questionId: string, value: string) => {
    setFormData((prev) => {
      const newData = {
        ...prev,
        customAnswers: { ...prev.customAnswers, [questionId]: value },
      };
      debouncedSave(newData);
      return newData;
    });
  };

  // Read a common question's answer out of local form state. Named fields live
  // at the top level; everything the admin UI added lives in customAnswers.
  const commonAnswer = (questionId: string): string =>
    isNamedCommonField(questionId)
      ? ((formData[questionId as keyof FormData] as string) || "")
      : (formData.customAnswers[questionId] || "");

  // Add/remove a preferred system. Added systems go to the end of the ranking;
  // the applicant reorders with moveSystem.
  const toggleSystem = (system: string) => {
    setFormData((prev) => {
      const isSelected = prev.preferredSystems.includes(system);
      if (!isSelected && prev.preferredSystems.length >= 3) return prev;

      const newSystems = isSelected
        ? prev.preferredSystems.filter((s) => s !== system)
        : [...prev.preferredSystems, system];

      const newData = { ...prev, preferredSystems: newSystems };
      debouncedSave(newData);
      return newData;
    });
  };

  // Move a preferred system up (-1) or down (+1) in the ranking.
  const moveSystem = (index: number, delta: number) => {
    setFormData((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.preferredSystems.length) return prev;

      const newSystems = [...prev.preferredSystems];
      [newSystems[index], newSystems[target]] = [newSystems[target], newSystems[index]];

      const newData = { ...prev, preferredSystems: newSystems };
      debouncedSave(newData);
      return newData;
    });
  };

  // Handle common question change
  const handleCommonQuestionChange = (questionId: string, value: string) => {
    setFormData((prev) => {
      const newData = isNamedCommonField(questionId)
        ? { ...prev, [questionId]: value }
        : {
            ...prev,
            customAnswers: { ...prev.customAnswers, [questionId]: value },
          };
      debouncedSave(newData);
      return newData;
    });
  };

  // Handle team question change
  const handleTeamQuestionChange = (questionId: string, value: string) => {
    setFormData((prev) => {
      const newData = {
        ...prev,
        teamQuestions: { ...prev.teamQuestions, [questionId]: value },
      };
      debouncedSave(newData);
      return newData;
    });
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !application) return;

    // Validate file type
    const allowedTypes = ["application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      setUploadError("Please upload a PDF document");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size must be less than 5MB");
      return;
    }

    // Validate page count (2 pages max)
    try {
      const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      if (pdfDoc.getPageCount() > 2) {
        setUploadError("Resume must be 2 pages or fewer");
        return;
      }
    } catch (err) {
      console.error("Failed to read PDF:", err);
      setUploadError("Unable to read PDF. Please try a different file.");
      return;
    }

    setUploadError(null);
    setUploadProgress(0);

    try {
      const storageRef = ref(
        storage,
        `resumes/${application.userId}/${application.id}/${file.name}`
      );
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Upload error:", error);
          setUploadError("Failed to upload file. Please try again.");
          setUploadProgress(null);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setFormData((prev) => {
            const newData = { ...prev, resumeUrl: downloadURL };
            saveFormData(newData);
            return newData;
          });
          posthog.capture("resume_uploaded", {
            team,
            file_type: file.type,
          });
          setUploadProgress(null);
        }
      );
    } catch (err) {
      console.error(err);
      setUploadError("Failed to upload file. Please try again.");
      setUploadProgress(null);
    }
  };

  // Handle portfolio upload. Kept separate from the resume handler on purpose:
  // the portfolio is optional, accepts more file types, allows a much larger
  // file, and has no page limit.
  const handlePortfolioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !application) return;

    if (!PORTFOLIO_ALLOWED_TYPES.includes(file.type)) {
      setPortfolioError("Please upload a PDF, image, or ZIP file");
      return;
    }

    if (file.size > PORTFOLIO_MAX_BYTES) {
      setPortfolioError(`File size must be less than ${PORTFOLIO_MAX_MB}MB`);
      return;
    }

    setPortfolioError(null);
    setPortfolioProgress(0);

    try {
      const storageRef = ref(
        storage,
        `portfolios/${application.userId}/${application.id}/${file.name}`
      );
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          setPortfolioProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        },
        (error) => {
          console.error("Portfolio upload error:", error);
          setPortfolioError("Failed to upload file. Please try again.");
          setPortfolioProgress(null);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setFormData((prev) => {
            const newData = { ...prev, portfolioUrl: downloadURL };
            saveFormData(newData);
            return newData;
          });
          posthog.capture("portfolio_uploaded", {
            team,
            file_type: file.type,
          });
          setPortfolioProgress(null);
        }
      );
    } catch (err) {
      console.error(err);
      setPortfolioError("Failed to upload file. Please try again.");
      setPortfolioProgress(null);
    }
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!application) return;

    // Validate required fields
    const missingFields: string[] = [];

    // Resume is always required
    if (!formData.resumeUrl) {
      missingFields.push("Resume");
    }

    commonQuestions.forEach((q) => {
      if (q.required) {
        const val = commonAnswer(q.id);
        if (!val || !val.trim()) {
          missingFields.push(q.label);
        }
      }
    });

    teamQuestions.forEach((q) => {
      if (q.required) {
        const val = formData.teamQuestions[q.id];
        if (!val || !val.trim()) {
          missingFields.push(q.label);
        }
      }
    });

    // Only questions for systems they actually picked are required.
    activeSystemQuestions.forEach(({ system, questions }) => {
      questions.forEach((q) => {
        if (q.required) {
          const val = formData.customAnswers[q.id];
          if (!val || !val.trim()) {
            missingFields.push(`${q.label} (${system})`);
          }
        }
      });
    });

    if (formData.preferredSystems.length === 0) {
      missingFields.push("Preferred Systems (at least one)");
    }

    if (missingFields.length > 0) {
      setError(`Please fill in the following required fields: ${missingFields.join(", ")}`);
      return;
    }

    // Validate word counts
    const overLimitFields: string[] = [];
    commonQuestions.forEach((q) => {
      if (q.maxWordCount) {
        const value = commonAnswer(q.id);
        if (countWords(value) > q.maxWordCount) {
          overLimitFields.push(`${q.label} (max ${q.maxWordCount} words)`);
        }
      }
    });
    teamQuestions.forEach((q) => {
      if (q.maxWordCount) {
        const value = formData.teamQuestions[q.id] || "";
        if (countWords(value) > q.maxWordCount) {
          overLimitFields.push(`${q.label} (max ${q.maxWordCount} words)`);
        }
      }
    });
    activeSystemQuestions.forEach(({ questions }) => {
      questions.forEach((q) => {
        if (q.maxWordCount) {
          const value = formData.customAnswers[q.id] || "";
          if (countWords(value) > q.maxWordCount) {
            overLimitFields.push(`${q.label} (max ${q.maxWordCount} words)`);
          }
        }
      });
    });
    if (overLimitFields.length > 0) {
      setError(`The following fields exceed the word limit: ${overLimitFields.join(", ")}`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Save form data first
      await saveFormData(formData);

      // Then submit
      const res = await fetch(`/api/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: ApplicationStatus.SUBMITTED,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit application");
      }

      posthog.capture("application_submitted", {
        team,
        preferred_system_count: formData.preferredSystems.length,
        has_portfolio: Boolean(formData.portfolioUrl),
      });
      router.push("/dashboard?submitted=true");
    } catch (err) {
      console.error(err);
      setError("Failed to submit application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle 404 for invalid team
  if (!team) {
    notFound();
  }

  // --- Cycle not open yet ---
  // Checked before the loading/submitted states: during pre-open the
  // application fetch 403s, which would otherwise fall through to them.
  if (!stepLoading && recruitingStep === RecruitingStep.PRE_OPEN) {
    return (
      <main className="min-h-screen pt-24 pb-20" style={{ background: "var(--pub-bg)" }}>
        <div className="container mx-auto px-4 sm:px-6 md:px-10 max-w-3xl">
          <ApplicationsNotOpenNotice />
        </div>
      </main>
    );
  }

  // --- Input styling helper ---
  const inputClass = "w-full rounded-xl px-4 py-3 font-urbanist text-[14px] text-[var(--pub-text-strong)] placeholder:text-[var(--pub-text-3)] focus:outline-none transition-colors";
  const inputStyle = { backgroundColor: "var(--pub-field)", border: "1px solid var(--pub-border)" };

  // --- Loading state ---
  // Waits on the recruiting step too: during pre-open the application fetch
  // 403s, and rendering the states below before the step is known would flash
  // the wrong screen.
  if (loading || stepLoading) {
    return (
      <main className="min-h-screen pt-24 pb-20 flex items-center justify-center" style={{ background: "var(--pub-bg)" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: teamInk }} />
          <p className="font-urbanist text-[14px]" style={{ color: "var(--pub-text-2)" }}>Loading application...</p>
        </div>
      </main>
    );
  }

  // --- Already submitted state ---
  if (application?.status !== ApplicationStatus.IN_PROGRESS) {
    return (
      <main className="min-h-screen pt-24 pb-20" style={{ background: "var(--pub-bg)" }}>
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <div
            className="p-10 rounded-2xl"
            style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
          >
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
              style={{ backgroundColor: "var(--status-success-bg)", border: "1px solid var(--status-success-border)" }}
            >
              <CheckCircle className="h-7 w-7" style={{ color: "var(--status-success-ink)" }} />
            </div>
            <h1 className="font-montserrat text-[22px] font-bold mb-3" style={{ color: "var(--pub-heading)" }}>
              Application Submitted
            </h1>
            <p className="font-urbanist text-[14px] mb-7" style={{ color: "var(--pub-text-2)" }}>
              Your application to <span style={{ color: teamInk }}>{teamInfo?.name}</span> has been submitted and is under review.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-xl px-7 font-urbanist text-[13px] font-semibold transition-colors cursor-pointer"
              style={{ backgroundColor: "var(--lhr-blue)", color: "#fff" }}
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // --- Main form ---
  return (
    <main className="min-h-screen pt-24 pb-20" style={{ background: "var(--pub-bg)" }}>
      {/* Ambient glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, color-mix(in srgb, ${teamAccent} 6%, transparent), transparent 70%)`,
        }}
      />

      <div className="container mx-auto px-4 max-w-2xl relative">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={routes.apply}
            className="inline-flex items-center gap-2 font-urbanist text-[13px] mb-5 transition-colors cursor-pointer"
            style={{ color: "var(--pub-text-2)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--pub-heading)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--pub-text-2)"; }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to teams
          </Link>
          {/* Team accent stripe */}
          <div className="h-0.5 rounded-full mb-5 w-16" style={{ backgroundColor: teamAccent, opacity: 0.5 }} />
          <h1 className="font-montserrat text-[28px] md:text-[34px] font-bold mb-2" style={{ color: "var(--pub-heading)" }}>
            Apply to{" "}
            <span style={{ color: teamInk }}>{teamInfo?.name}</span>
          </h1>
          <p className="font-urbanist text-[14px]" style={{ color: "var(--pub-text-2)" }}>
            Fill out the application form below. Your progress is automatically saved.
          </p>
        </div>

        {/* Save Status Indicator */}
        <div className="flex items-center justify-end mb-4 h-6">
          {saveStatus === "saving" && (
            <span className="font-urbanist text-[12px] flex items-center gap-2" style={{ color: "var(--pub-text-3)" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="font-urbanist text-[12px] flex items-center gap-1.5" style={{ color: "var(--status-success-ink)" }}>
              <CheckCircle className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="font-urbanist text-[12px]" style={{ color: "var(--status-error-ink)" }}>Failed to save</span>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="mb-6 p-4 rounded-xl font-urbanist text-[13px]"
            style={{ backgroundColor: "var(--status-error-bg)", border: "1px solid var(--status-error-border)", color: "var(--status-error-ink)" }}
          >
            {error}
          </div>
        )}

        {/* Editing an application that has already been submitted. Allowed
            until applications close; re-submitting updates submittedAt. */}
        {isEditingSubmitted && (
          <div
            className="mb-6 p-4 rounded-xl font-urbanist text-[13px]"
            style={{ backgroundColor: "var(--status-warn-bg)", border: "1px solid var(--status-warn-border)", color: "var(--status-warn-ink)" }}
          >
            You&apos;ve already submitted this application. Changes save automatically and it
            stays submitted — you can keep editing until applications close.
          </div>
        )}

        {/* Application Form */}
        <form onSubmit={handleSubmit} className="space-y-7">

          {/* Preferred Systems — Ranked Selection */}
          <div
            className="p-6 rounded-2xl"
            style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
          >
            <h2 className="font-montserrat text-[16px] font-bold mb-1.5" style={{ color: "var(--pub-heading)" }}>
              Preferred Systems
            </h2>
            <p className="font-urbanist text-[13px] mb-5" style={{ color: "var(--pub-text-2)" }}>
              Pick up to 3 systems below. The order you pick them is your order of preference —
              use the arrows to rearrange. You may receive interview offers for any of these.
            </p>

            {/* Your ranking — ordinal list with reorder controls. This is the
                authoritative view of the ranking; the grid below is just the
                picker. */}
            {formData.preferredSystems.length > 0 && (
              <div
                className="mb-4 p-4 rounded-xl space-y-2"
                style={{ backgroundColor: "var(--pub-field)", border: "1px solid var(--pub-border)" }}
              >
                <p className="font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: "var(--pub-text-3)" }}>
                  Your ranking
                </p>
                {formData.preferredSystems.map((sys, idx) => {
                  const rc = RANK_COLORS[idx];
                  const isFirst = idx === 0;
                  const isLast = idx === formData.preferredSystems.length - 1;
                  return (
                    <div
                      key={sys}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg"
                      style={{ backgroundColor: rc.bg, border: `1px solid ${rc.border}` }}
                    >
                      <span
                        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                        style={{ backgroundColor: rc.solid, color: rc.on }}
                      >
                        {idx + 1}
                      </span>
                      <span className="font-urbanist text-[13px] font-semibold min-w-0 flex-1 truncate" style={{ color: rc.text }}>
                        <span className="uppercase tracking-wide text-[10px] mr-2 opacity-70">{RANK_LABELS[idx]}</span>
                        {sys}
                      </span>
                      <button
                        type="button"
                        aria-label={`Move ${sys} up`}
                        disabled={isFirst}
                        onClick={() => moveSystem(idx, -1)}
                        className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                        style={{ backgroundColor: "var(--pub-surface-2)", color: "var(--pub-text-2)" }}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${sys} down`}
                        disabled={isLast}
                        onClick={() => moveSystem(idx, 1)}
                        className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                        style={{ backgroundColor: "var(--pub-surface-2)", color: "var(--pub-text-2)" }}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${sys}`}
                        onClick={() => toggleSystem(sys)}
                        className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer"
                        style={{ backgroundColor: "var(--pub-surface-2)", color: "var(--pub-text-3)" }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {systemOptions.map((option) => {
                const rankIndex = formData.preferredSystems.indexOf(option.value);
                const isSelected = rankIndex !== -1;
                const isDisabled = !isSelected && formData.preferredSystems.length >= 3;
                const rankNum = isSelected ? rankIndex + 1 : null;

                return (
                  <button
                    type="button"
                    key={option.value}
                    disabled={isDisabled}
                    onClick={() => toggleSystem(option.value)}
                    className="flex items-center gap-3 p-4 rounded-xl transition-all text-left"
                    style={
                      isSelected
                        ? { backgroundColor: `color-mix(in srgb, ${teamAccent} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${teamAccent} 30%, transparent)`, cursor: "pointer" }
                        : isDisabled
                          ? { backgroundColor: "var(--pub-field)", border: "1px solid var(--pub-border)", opacity: 0.4, cursor: "not-allowed" }
                          : { backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)", cursor: "pointer" }
                    }
                  >
                    {/* Rank badge or empty circle */}
                    {rankNum ? (
                      <span
                        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                        style={{ backgroundColor: RANK_COLORS[rankNum - 1].solid, color: RANK_COLORS[rankNum - 1].on }}
                      >
                        {rankNum}
                      </span>
                    ) : (
                      <span
                        className="flex-shrink-0 w-6 h-6 rounded-full"
                        style={{ border: isDisabled ? "1.5px solid var(--pub-border)" : "1.5px solid var(--pub-border-strong)" }}
                      />
                    )}
                    <span
                      className="font-urbanist text-[13px] font-semibold"
                      style={{ color: isSelected ? teamInk : isDisabled ? "var(--pub-text-3)" : "var(--pub-text)" }}
                    >
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Common Questions */}
          <div
            className="p-6 rounded-2xl"
            style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
          >
            <h2 className="font-montserrat text-[16px] font-bold mb-5" style={{ color: "var(--pub-heading)" }}>
              About You
            </h2>
            {questionsLoading && commonQuestions.length === 0 ? (
              <div className="flex items-center gap-3 py-10 justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--pub-text-3)]" />
                <span className="font-urbanist text-[13px]" style={{ color: "var(--pub-text-3)" }}>Loading questions...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {commonQuestions.map((question) => (
                  <div key={question.id}>
                    <label className="block font-urbanist text-[13px] font-semibold mb-2" style={{ color: "var(--pub-text)" }}>
                      {question.label}
                      {question.required && (
                        <span className="ml-1" style={{ color: "var(--status-error-ink)" }}>*</span>
                      )}
                    </label>
                    {question.type === "select" ? (() => {
                      const currentVal = commonAnswer(question.id);
                      const isOtherSelected = question.allowOther && currentVal !== "" && !question.options?.includes(currentVal);
                      return (
                        <>
                          <select
                            name={question.id}
                            value={isOtherSelected ? "__other__" : currentVal}
                            onChange={(e) => {
                              // " " marks "Other" as chosen but not yet typed into.
                              handleCommonQuestionChange(
                                question.id,
                                e.target.value === "__other__" ? " " : e.target.value
                              );
                            }}
                            className={inputClass}
                            style={inputStyle}
                          >
                            <option value="" style={optionStyle}>Select...</option>
                            {question.options?.map((option) => (
                              <option key={option} value={option} style={optionStyle}>
                                {option}
                              </option>
                            ))}
                            {question.allowOther && (
                              <option value="__other__" style={optionStyle}>Other</option>
                            )}
                          </select>
                          {isOtherSelected && (
                            <input
                              type="text"
                              value={currentVal.startsWith(" ") ? currentVal.substring(1) : currentVal}
                              onChange={(e) => handleCommonQuestionChange(question.id, e.target.value || " ")}
                              placeholder="Please specify..."
                              className={`${inputClass} mt-2`}
                              style={inputStyle}
                            />
                          )}
                        </>
                      );
                    })() : question.type === "text" ? (
                      <>
                        <input
                          type="text"
                          name={question.id}
                          value={commonAnswer(question.id)}
                          onChange={(e) => handleCommonQuestionChange(question.id, e.target.value)}
                          placeholder={question.placeholder}
                          className={inputClass}
                          style={inputStyle}
                        />
                        {question.maxWordCount && (
                          <p
                            className="font-urbanist text-[11px] mt-1.5 text-right"
                            style={{
                              color: countWords(commonAnswer(question.id)) > question.maxWordCount
                                ? "var(--status-error-ink)" : "var(--pub-text-3)"
                            }}
                          >
                            {countWords(commonAnswer(question.id))} / {question.maxWordCount} words
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <textarea
                          name={question.id}
                          value={commonAnswer(question.id)}
                          onChange={(e) => handleCommonQuestionChange(question.id, e.target.value)}
                          placeholder={question.placeholder}
                          rows={4}
                          className={`${inputClass} resize-y`}
                          style={inputStyle}
                        />
                        {question.maxWordCount && (
                          <p
                            className="font-urbanist text-[11px] mt-1.5 text-right"
                            style={{
                              color: countWords(commonAnswer(question.id)) > question.maxWordCount
                                ? "var(--status-error-ink)" : "var(--pub-text-3)"
                            }}
                          >
                            {countWords(commonAnswer(question.id))} / {question.maxWordCount} words
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team-Specific Questions */}
          {(teamQuestions.length > 0 || questionsLoading) && (
            <div
              className="p-6 rounded-2xl"
              style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
            >
              {/* Team accent bar */}
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-1 h-5 rounded-full" style={{ backgroundColor: teamAccent, opacity: 0.6 }} />
                <h2 className="font-montserrat text-[16px] font-bold" style={{ color: "var(--pub-heading)" }}>
                  {teamInfo?.name} Questions
                </h2>
              </div>
              {questionsLoading && teamQuestions.length === 0 ? (
                <div className="flex items-center gap-3 py-10 justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--pub-text-3)]" />
                  <span className="font-urbanist text-[13px]" style={{ color: "var(--pub-text-3)" }}>Loading questions...</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {teamQuestions.map((question) => (
                    <div key={question.id}>
                      <label className="block font-urbanist text-[13px] font-semibold mb-2" style={{ color: "var(--pub-text)" }}>
                        {question.label}
                        {question.required && (
                          <span className="ml-1" style={{ color: "var(--status-error-ink)" }}>*</span>
                      )}
                      </label>
                      {question.type === "select" ? (() => {
                        const currentVal = formData.teamQuestions[question.id] || "";
                        const isOtherSelected = question.allowOther && currentVal !== "" && !question.options?.includes(currentVal);
                        return (
                          <>
                            <select
                              value={isOtherSelected ? "__other__" : currentVal}
                              onChange={(e) => {
                                if (e.target.value === "__other__") {
                                  handleTeamQuestionChange(question.id, " ");
                                } else {
                                  handleTeamQuestionChange(question.id, e.target.value);
                                }
                              }}
                              className={inputClass}
                              style={inputStyle}
                            >
                              <option value="" style={optionStyle}>Select an option...</option>
                              {question.options?.map((option) => (
                                <option key={option} value={option} style={optionStyle}>
                                  {option}
                                </option>
                              ))}
                              {question.allowOther && (
                                <option value="__other__" style={optionStyle}>Other</option>
                              )}
                            </select>
                            {isOtherSelected && (
                              <input
                                type="text"
                                value={currentVal.startsWith(" ") ? currentVal.substring(1) : currentVal}
                                onChange={(e) => handleTeamQuestionChange(question.id, e.target.value || " ")}
                                placeholder="Please specify..."
                                className={`${inputClass} mt-2`}
                                style={inputStyle}
                              />
                            )}
                          </>
                        );
                      })() : (
                        <>
                          <textarea
                            value={formData.teamQuestions[question.id] || ""}
                            onChange={(e) =>
                              handleTeamQuestionChange(question.id, e.target.value)
                            }
                            placeholder={question.placeholder}
                            rows={4}
                            className={`${inputClass} resize-y`}
                            style={inputStyle}
                          />
                          {question.maxWordCount && (
                            <p
                              className="font-urbanist text-[11px] mt-1.5 text-right"
                              style={{
                                color: countWords(formData.teamQuestions[question.id] || "") > question.maxWordCount
                                  ? "var(--status-error-ink)" : "var(--pub-text-3)"
                              }}
                            >
                              {countWords(formData.teamQuestions[question.id] || "")} / {question.maxWordCount} words
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* System-Specific Questions — only for systems the applicant picked.
              Answers live in customAnswers, keyed by question id, so they
              persist even though these questions have no named field. */}
          {activeSystemQuestions.length > 0 && (
            <div
              className="p-6 rounded-2xl"
              style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
            >
              <div className="h-1 w-12 rounded-full mb-4" style={{ backgroundColor: teamAccent }} />
              <h2 className="font-montserrat text-[16px] font-bold mb-1.5" style={{ color: "var(--pub-heading)" }}>
                About Your Systems
              </h2>
              <p className="font-urbanist text-[13px] mb-5" style={{ color: "var(--pub-text-2)" }}>
                A few extra questions based on the systems you ranked.
              </p>

              <div className="space-y-7">
                {activeSystemQuestions.map(({ system, questions }) => (
                  <div key={system}>
                    <p
                      className="font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-3"
                      style={{ color: "var(--pub-text-3)" }}
                    >
                      {system}
                    </p>
                    <div className="space-y-6">
                      {questions.map((question) => (
                        <div key={question.id}>
                          <label className="block font-urbanist text-[13px] font-semibold mb-2" style={{ color: "var(--pub-text)" }}>
                            {question.label}
                            {question.required && (
                              <span className="ml-1" style={{ color: "var(--status-error-ink)" }}>*</span>
                            )}
                          </label>
                          {question.type === "select" ? (
                            <select
                              value={formData.customAnswers[question.id] || ""}
                              onChange={(e) => handleCustomAnswerChange(question.id, e.target.value)}
                              className={inputClass}
                              style={inputStyle}
                            >
                              <option value="" style={optionStyle}>Select an option...</option>
                              {question.options?.map((option) => (
                                <option key={option} value={option} style={optionStyle}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : question.type === "text" ? (
                            <input
                              type="text"
                              value={formData.customAnswers[question.id] || ""}
                              onChange={(e) => handleCustomAnswerChange(question.id, e.target.value)}
                              placeholder={question.placeholder}
                              className={inputClass}
                              style={inputStyle}
                            />
                          ) : (
                            <>
                              <textarea
                                value={formData.customAnswers[question.id] || ""}
                                onChange={(e) => handleCustomAnswerChange(question.id, e.target.value)}
                                placeholder={question.placeholder}
                                rows={4}
                                className={`${inputClass} resize-y`}
                                style={inputStyle}
                              />
                              {question.maxWordCount && (
                                <p
                                  className="font-urbanist text-[11px] mt-1.5 text-right"
                                  style={{
                                    color: countWords(formData.customAnswers[question.id] || "") > question.maxWordCount
                                      ? "var(--status-error-ink)" : "var(--pub-text-3)"
                                  }}
                                >
                                  {countWords(formData.customAnswers[question.id] || "")} / {question.maxWordCount} words
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resume Upload */}
          <div
            className="p-6 rounded-2xl"
            style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
          >
            <h2 className="font-montserrat text-[16px] font-bold mb-1" style={{ color: "var(--pub-heading)" }}>
              Resume <span style={{ color: "var(--status-error-ink)" }}>*</span>
            </h2>
            <p className="font-urbanist text-[13px] mb-1" style={{ color: "var(--pub-text-2)" }}>
              Upload your resume in PDF format (max 5MB, 2 pages max). Required.
            </p>
            <a
              href="https://utexas.app.box.com/s/p9mt1wierhp1td4bnafm0z87ee0hqtky"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-urbanist text-[13px] font-semibold transition-colors cursor-pointer mb-5"
              style={{ color: teamInk }}
            >
              <ExternalLink className="h-3 w-3" />
              Example resume template for reference
            </a>

            {formData.resumeUrl ? (
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "var(--status-success-bg)" }}
                  >
                    <FileText className="h-4 w-4" style={{ color: "var(--status-success-ink)" }} />
                  </div>
                  <span className="font-urbanist text-[13px] font-semibold" style={{ color: "var(--pub-text)" }}>Resume uploaded</span>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={formData.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 font-urbanist text-[12px] font-semibold transition-colors cursor-pointer"
                    style={{ color: teamInk }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Preview
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => {
                        const newData = { ...prev, resumeUrl: "" };
                        saveFormData(newData);
                        return newData;
                      });
                    }}
                    className="font-urbanist text-[12px] font-semibold transition-colors cursor-pointer"
                    style={{ color: "rgba(239,68,68,0.6)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.9)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.6)"; }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={uploadProgress !== null}
                />
                <div
                  className="flex items-center justify-center p-9 rounded-xl transition-colors"
                  style={{ border: "2px dashed var(--pub-border-strong)", backgroundColor: "var(--pub-field)" }}
                >
                  {uploadProgress !== null ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--pub-surface-2)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%`, backgroundColor: teamAccent }}
                        />
                      </div>
                      <span className="font-urbanist text-[12px]" style={{ color: "var(--pub-text-3)" }}>
                        Uploading... {Math.round(uploadProgress)}%
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-7 w-7 text-[var(--pub-text-3)]" />
                      <span className="font-urbanist text-[13px]" style={{ color: "var(--pub-text-2)" }}>
                        Click or drag to upload resume
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {uploadError && (
              <p className="mt-2 font-urbanist text-[12px]" style={{ color: "var(--status-error-ink)" }}>{uploadError}</p>
            )}
          </div>

          {/* Portfolio Upload — optional, no page limit, any creative work */}
          <div
            className="p-6 rounded-2xl"
            style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
          >
            <h2 className="font-montserrat text-[16px] font-bold mb-1" style={{ color: "var(--pub-heading)" }}>
              Portfolio <span className="font-urbanist text-[12px] font-medium" style={{ color: "var(--pub-text-3)" }}>Optional</span>
            </h2>
            <p className="font-urbanist text-[13px] mb-5" style={{ color: "var(--pub-text-2)" }}>
              Show us something you&apos;ve made — it doesn&apos;t have to be engineering. Art,
              photography, writing, music, design, film, anything you&apos;re proud of. No page
              limit. PDF, image, or ZIP up to {PORTFOLIO_MAX_MB}MB.
            </p>

            {formData.portfolioUrl ? (
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "var(--status-success-bg)" }}
                  >
                    <FileText className="h-4 w-4" style={{ color: "var(--status-success-ink)" }} />
                  </div>
                  <span className="font-urbanist text-[13px] font-semibold" style={{ color: "var(--pub-text)" }}>Portfolio uploaded</span>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={formData.portfolioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 font-urbanist text-[12px] font-semibold transition-colors cursor-pointer"
                    style={{ color: teamInk }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Preview
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => {
                        const newData = { ...prev, portfolioUrl: "" };
                        saveFormData(newData);
                        return newData;
                      });
                    }}
                    className="font-urbanist text-[12px] font-semibold transition-colors cursor-pointer"
                    style={{ color: "rgba(239,68,68,0.6)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.9)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.6)"; }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.zip"
                  onChange={handlePortfolioUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={portfolioProgress !== null}
                />
                <div
                  className="flex items-center justify-center p-9 rounded-xl transition-colors"
                  style={{ border: "2px dashed var(--pub-border-strong)", backgroundColor: "var(--pub-field)" }}
                >
                  {portfolioProgress !== null ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--pub-surface-2)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${portfolioProgress}%`, backgroundColor: teamAccent }}
                        />
                      </div>
                      <span className="font-urbanist text-[12px]" style={{ color: "var(--pub-text-3)" }}>
                        Uploading... {Math.round(portfolioProgress)}%
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-7 w-7 text-[var(--pub-text-3)]" />
                      <span className="font-urbanist text-[13px]" style={{ color: "var(--pub-text-2)" }}>
                        Click or drag to upload portfolio
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {portfolioError && (
              <p className="mt-2 font-urbanist text-[12px]" style={{ color: "var(--status-error-ink)" }}>{portfolioError}</p>
            )}
          </div>

          {/* Save Status + Submit */}
          <div className="space-y-3">
            <div className="flex items-center justify-end h-6">
              {saveStatus === "saving" && (
                <span className="font-urbanist text-[12px] flex items-center gap-2" style={{ color: "var(--pub-text-3)" }}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="font-urbanist text-[12px] flex items-center gap-1.5" style={{ color: "var(--status-success-ink)" }}>
                  <CheckCircle className="h-3.5 w-3.5" />
                  Saved
                </span>
              )}
              {saveStatus === "error" && (
                <span className="font-urbanist text-[12px]" style={{ color: "var(--status-error-ink)" }}>Failed to save</span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => saveFormData(formData)}
                disabled={saving}
                className="flex-1 h-12 rounded-xl font-urbanist text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                style={{ backgroundColor: "var(--pub-surface-2)", border: "1px solid var(--pub-border-strong)", color: "var(--pub-text-strong)" }}
              >
                <Save className="h-4 w-4" />
                Save Progress
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 h-12 rounded-xl font-montserrat text-[13px] font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                style={{ backgroundColor: teamAccent, color: "var(--pub-cta-ink)" }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isEditingSubmitted ? "Saving..." : "Submitting..."}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {isEditingSubmitted ? "Save Changes" : "Submit Application"}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

