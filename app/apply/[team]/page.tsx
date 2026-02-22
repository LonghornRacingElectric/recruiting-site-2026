"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import Link from "next/link";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { Team } from "@/lib/models/User";
import { Application, ApplicationStatus } from "@/lib/models/Application";
import { TEAM_SYSTEMS, TEAM_INFO } from "@/lib/models/teamQuestions";
import { ApplicationQuestion } from "@/lib/models/Config";
import { routes } from "@/lib/routes";
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
} from "lucide-react";

const TEAM_CSS_COLORS: Record<string, string> = {
  Electric: "var(--lhr-blue)",
  Solar: "var(--lhr-gold)",
  Combustion: "var(--lhr-orange)",
};

const optionStyle = { backgroundColor: "#0c1218", color: "white" };

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

// Word count helper
function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

interface FormData {
  whyJoin: string;
  relevantExperience: string;
  availability: string;
  resumeUrl: string;
  preferredSystems: string[];
  graduationYear: string;
  major: string;
  teamQuestions: Record<string, string>;
}

export default function TeamApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const teamParam = (params.team as string)?.toLowerCase();

  // Validate team parameter
  const team = Object.values(Team).find(
    (t) => t.toLowerCase() === teamParam
  ) as Team | undefined;

  const teamInfo = TEAM_INFO.find((t) => t.team === team);
  const systemOptions = team ? TEAM_SYSTEMS[team] : [];
  const teamAccent = team ? (TEAM_CSS_COLORS[team] || "var(--lhr-blue)") : "var(--lhr-blue)";

  // Dynamic questions from API
  const [commonQuestions, setCommonQuestions] = useState<ApplicationQuestion[]>([]);
  const [teamQuestions, setTeamQuestions] = useState<ApplicationQuestion[]>([]);
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

  // Form state
  const [formData, setFormData] = useState<FormData>({
    whyJoin: "",
    relevantExperience: "",
    availability: "",
    resumeUrl: "",
    preferredSystems: [],
    graduationYear: "",
    major: "",
    teamQuestions: {},
  });

  // Fetch questions from API
  useEffect(() => {
    if (!team) return;

    async function fetchQuestions() {
      try {
        const res = await fetch(`/api/questions?team=${team}`);
        if (res.ok) {
          const data = await res.json();
          setCommonQuestions(data.commonQuestions || []);
          setTeamQuestions(data.teamQuestions || []);
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
            preferredSystems: app.preferredSystems || [],
            graduationYear: app.formData.graduationYear || "",
            major: app.formData.major || "",
            teamQuestions: app.formData.teamQuestions || {},
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

  // Save form data to API
  const saveFormData = useCallback(
    async (data: FormData) => {
      if (!application) return;

      setSaveStatus("saving");
      try {
        const res = await fetch(`/api/applications/${application.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formData: {
              whyJoin: data.whyJoin,
              relevantExperience: data.relevantExperience,
              availability: data.availability,
              resumeUrl: data.resumeUrl,
              graduationYear: data.graduationYear,
              major: data.major,
              teamQuestions: data.teamQuestions,
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

  // Handle input change
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      const newData = { ...prev, [name]: value };
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
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      setUploadError("Please upload a PDF or Word document");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size must be less than 5MB");
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
          setUploadProgress(null);
        }
      );
    } catch (err) {
      console.error(err);
      setUploadError("Failed to upload file. Please try again.");
      setUploadProgress(null);
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
        const val = (formData[q.id as keyof FormData] as string);
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
        const value = (formData[q.id as keyof FormData] as string) || "";
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

  // --- Input styling helper ---
  const inputClass = "w-full rounded-xl px-4 py-3 font-urbanist text-[14px] text-white placeholder:text-white/20 focus:outline-none transition-colors";
  const inputStyle = { backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" };

  // --- Loading state ---
  if (loading) {
    return (
      <main className="min-h-screen pt-24 pb-20 flex items-center justify-center" style={{ background: "#030608" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: teamAccent }} />
          <p className="font-urbanist text-[14px] text-white/30">Loading application...</p>
        </div>
      </main>
    );
  }

  // --- Already submitted state ---
  if (application?.status !== ApplicationStatus.IN_PROGRESS) {
    return (
      <main className="min-h-screen pt-24 pb-20" style={{ background: "#030608" }}>
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <div
            className="p-10 rounded-2xl"
            style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
              style={{ backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}
            >
              <CheckCircle className="h-7 w-7" style={{ color: "rgba(34,197,94,0.8)" }} />
            </div>
            <h1 className="font-montserrat text-[22px] font-bold text-white mb-3">
              Application Submitted
            </h1>
            <p className="font-urbanist text-[14px] text-white/40 mb-7">
              Your application to <span style={{ color: teamAccent }}>{teamInfo?.name}</span> has been submitted and is under review.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-xl px-7 font-urbanist text-[13px] font-semibold text-white transition-colors"
              style={{ backgroundColor: "var(--lhr-blue)" }}
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
    <main className="min-h-screen pt-24 pb-20" style={{ background: "#030608" }}>
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
            className="inline-flex items-center gap-2 font-urbanist text-[13px] text-white/30 mb-5 transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to teams
          </Link>
          {/* Team accent stripe */}
          <div className="h-0.5 rounded-full mb-5 w-16" style={{ backgroundColor: teamAccent, opacity: 0.5 }} />
          <h1 className="font-montserrat text-[28px] md:text-[34px] font-bold text-white mb-2">
            Apply to{" "}
            <span style={{ color: teamAccent }}>{teamInfo?.name}</span>
          </h1>
          <p className="font-urbanist text-[14px] text-white/35">
            Fill out the application form below. Your progress is automatically saved.
          </p>
        </div>

        {/* Save Status Indicator */}
        <div className="flex items-center justify-end mb-4 h-6">
          {saveStatus === "saving" && (
            <span className="font-urbanist text-[12px] text-white/25 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="font-urbanist text-[12px] flex items-center gap-1.5" style={{ color: "rgba(34,197,94,0.7)" }}>
              <CheckCircle className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="font-urbanist text-[12px]" style={{ color: "rgba(239,68,68,0.7)" }}>Failed to save</span>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="mb-6 p-4 rounded-xl font-urbanist text-[13px]"
            style={{ backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", color: "rgba(239,68,68,0.8)" }}
          >
            {error}
          </div>
        )}

        {/* Application Form */}
        <form onSubmit={handleSubmit} className="space-y-7">

          {/* Preferred Systems */}
          <div
            className="p-6 rounded-2xl"
            style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <h2 className="font-montserrat text-[16px] font-bold text-white mb-1.5">
              Preferred Systems
            </h2>
            <p className="font-urbanist text-[13px] text-white/30 mb-5">
              Select up to 3 systems you are interested in. You may receive interview offers for any of these.
              {formData.preferredSystems.length >= 3 && (
                <span className="ml-2" style={{ color: "var(--lhr-gold)" }}>(Maximum reached)</span>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {systemOptions.map((option) => {
                const isSelected = formData.preferredSystems.includes(option.value);
                const isDisabled = !isSelected && formData.preferredSystems.length >= 3;
                return (
                  <label
                    key={option.value}
                    className="flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all"
                    style={
                      isSelected
                        ? { backgroundColor: `color-mix(in srgb, ${teamAccent} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${teamAccent} 30%, transparent)` }
                        : isDisabled
                          ? { backgroundColor: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", opacity: 0.4, cursor: "not-allowed" }
                          : { backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }
                    }
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={(e) => {
                        setFormData((prev) => {
                          const newSystems = e.target.checked
                            ? [...prev.preferredSystems, option.value]
                            : prev.preferredSystems.filter((s) => s !== option.value);
                          const newData = { ...prev, preferredSystems: newSystems };
                          debouncedSave(newData);
                          return newData;
                        });
                      }}
                      className="w-4.5 h-4.5 rounded border-neutral-600 bg-neutral-800 text-orange-600 focus:ring-orange-600 focus:ring-offset-neutral-900 disabled:opacity-50"
                    />
                    <span
                      className="font-urbanist text-[13px] font-semibold"
                      style={{ color: isSelected ? teamAccent : isDisabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.6)" }}
                    >
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Common Questions */}
          <div
            className="p-6 rounded-2xl"
            style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <h2 className="font-montserrat text-[16px] font-bold text-white mb-5">
              About You
            </h2>
            <div className="space-y-6">
              {commonQuestions.map((question) => (
                <div key={question.id}>
                  <label className="block font-urbanist text-[13px] font-semibold text-white/70 mb-2">
                    {question.label}
                    {question.required && (
                      <span className="ml-1" style={{ color: "rgba(239,68,68,0.7)" }}>*</span>
                    )}
                  </label>
                  {question.type === "select" ? (() => {
                    const currentVal = (formData[question.id as keyof FormData] as string) || "";
                    const isOtherSelected = question.allowOther && currentVal !== "" && !question.options?.includes(currentVal);
                    return (
                      <>
                        <select
                          name={question.id}
                          value={isOtherSelected ? "__other__" : currentVal}
                          onChange={(e) => {
                            if (e.target.value === "__other__") {
                              handleChange({ target: { name: question.id, value: " " } } as React.ChangeEvent<HTMLInputElement>);
                            } else {
                              handleChange(e as unknown as React.ChangeEvent<HTMLInputElement>);
                            }
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
                            value={currentVal.trim()}
                            onChange={(e) => handleChange({ target: { name: question.id, value: e.target.value || " " } } as React.ChangeEvent<HTMLInputElement>)}
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
                        value={formData[question.id as keyof FormData] as string}
                        onChange={handleChange}
                        placeholder={question.placeholder}
                        className={inputClass}
                        style={inputStyle}
                      />
                      {question.maxWordCount && (
                        <p
                          className="font-urbanist text-[11px] mt-1.5 text-right"
                          style={{
                            color: countWords((formData[question.id as keyof FormData] as string) || "") > question.maxWordCount
                              ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.2)"
                          }}
                        >
                          {countWords((formData[question.id as keyof FormData] as string) || "")} / {question.maxWordCount} words
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <textarea
                        name={question.id}
                        value={formData[question.id as keyof FormData] as string}
                        onChange={handleChange}
                        placeholder={question.placeholder}
                        rows={4}
                        className={`${inputClass} resize-y`}
                        style={inputStyle}
                      />
                      {question.maxWordCount && (
                        <p
                          className="font-urbanist text-[11px] mt-1.5 text-right"
                          style={{
                            color: countWords((formData[question.id as keyof FormData] as string) || "") > question.maxWordCount
                              ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.2)"
                          }}
                        >
                          {countWords((formData[question.id as keyof FormData] as string) || "")} / {question.maxWordCount} words
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Team-Specific Questions */}
          {teamQuestions.length > 0 && (
            <div
              className="p-6 rounded-2xl"
              style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {/* Team accent bar */}
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-1 h-5 rounded-full" style={{ backgroundColor: teamAccent, opacity: 0.6 }} />
                <h2 className="font-montserrat text-[16px] font-bold text-white">
                  {teamInfo?.name} Questions
                </h2>
              </div>
              <div className="space-y-6">
                {teamQuestions.map((question) => (
                  <div key={question.id}>
                    <label className="block font-urbanist text-[13px] font-semibold text-white/70 mb-2">
                      {question.label}
                      {question.required && (
                        <span className="ml-1" style={{ color: "rgba(239,68,68,0.7)" }}>*</span>
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
                              value={currentVal.trim()}
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
                                ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.2)"
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
            </div>
          )}

          {/* Resume Upload */}
          <div
            className="p-6 rounded-2xl"
            style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <h2 className="font-montserrat text-[16px] font-bold text-white mb-1">
              Resume <span style={{ color: "rgba(239,68,68,0.7)" }}>*</span>
            </h2>
            <p className="font-urbanist text-[13px] text-white/30 mb-5">
              Upload your resume in PDF or Word format (max 5MB). Required.
            </p>

            {formData.resumeUrl ? (
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "rgba(34,197,94,0.1)" }}
                  >
                    <FileText className="h-4 w-4" style={{ color: "rgba(34,197,94,0.8)" }} />
                  </div>
                  <span className="font-urbanist text-[13px] font-semibold text-white/60">Resume uploaded</span>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={formData.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 font-urbanist text-[12px] font-semibold transition-colors"
                    style={{ color: teamAccent }}
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
                    className="font-urbanist text-[12px] font-semibold transition-colors"
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
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={uploadProgress !== null}
                />
                <div
                  className="flex items-center justify-center p-9 rounded-xl transition-colors"
                  style={{ border: "2px dashed rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.01)" }}
                >
                  {uploadProgress !== null ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%`, backgroundColor: teamAccent }}
                        />
                      </div>
                      <span className="font-urbanist text-[12px] text-white/25">
                        Uploading... {Math.round(uploadProgress)}%
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-7 w-7 text-white/15" />
                      <span className="font-urbanist text-[13px] text-white/25">
                        Click or drag to upload resume
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {uploadError && (
              <p className="mt-2 font-urbanist text-[12px]" style={{ color: "rgba(239,68,68,0.7)" }}>{uploadError}</p>
            )}
          </div>

          {/* Save Status + Submit */}
          <div className="space-y-3">
            <div className="flex items-center justify-end h-6">
              {saveStatus === "saving" && (
                <span className="font-urbanist text-[12px] text-white/25 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="font-urbanist text-[12px] flex items-center gap-1.5" style={{ color: "rgba(34,197,94,0.7)" }}>
                  <CheckCircle className="h-3.5 w-3.5" />
                  Saved
                </span>
              )}
              {saveStatus === "error" && (
                <span className="font-urbanist text-[12px]" style={{ color: "rgba(239,68,68,0.7)" }}>Failed to save</span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => saveFormData(formData)}
                disabled={saving}
                className="flex-1 h-12 rounded-xl font-urbanist text-[13px] font-semibold text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <Save className="h-4 w-4" />
                Save Progress
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 h-12 rounded-xl font-montserrat text-[13px] font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                style={{ backgroundColor: teamAccent, color: "#030608" }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Application
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
