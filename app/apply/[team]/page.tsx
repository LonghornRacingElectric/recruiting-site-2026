"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import Link from "next/link";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { Team } from "@/lib/models/User";
import { Application, ApplicationStatus } from "@/lib/models/Application";
import {
  TEAM_QUESTIONS,
  COMMON_QUESTIONS,
  TEAM_SYSTEMS,
  TEAM_INFO,
} from "@/lib/models/teamQuestions";
import { routes } from "@/lib/routes";

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
  const teamQuestions = team ? TEAM_QUESTIONS[team] : [];
  const systemOptions = team ? TEAM_SYSTEMS[team] : [];

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

    COMMON_QUESTIONS.forEach((q) => {
      if (q.required && !formData[q.id as keyof FormData]) {
        missingFields.push(q.label);
      }
    });

    teamQuestions.forEach((q) => {
      if (q.required && !formData.teamQuestions[q.id]) {
        missingFields.push(q.label);
      }
    });

    if (formData.preferredSystems.length === 0) {
      missingFields.push("Preferred Systems (at least one)");
    }

    if (missingFields.length > 0) {
      setError(`Please fill in the following required fields: ${missingFields.join(", ")}`);
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

  if (loading) {
    return (
      <main className="min-h-screen bg-black pt-24 pb-20 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg
            className="animate-spin h-8 w-8 text-[#FFB526]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-neutral-400">Loading application...</p>
        </div>
      </main>
    );
  }

  // Don't allow editing submitted applications
  if (application?.status !== ApplicationStatus.IN_PROGRESS) {
    return (
      <main className="min-h-screen bg-black pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <div className="p-8 rounded-2xl bg-neutral-900 border border-white/5">
            <div className="text-5xl mb-4">✓</div>
            <h1 className="text-2xl font-bold text-white mb-4">
              Application Submitted
            </h1>
            <p className="text-neutral-400 mb-6">
              Your application to {teamInfo?.name} has been submitted and is
              under review.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-white px-6 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black pt-24 pb-20">
      <div className="container mx-auto px-4 max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={routes.apply}
            className="inline-flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-4"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to teams
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Apply to{" "}
            <span style={{ color: teamInfo?.color }}>{teamInfo?.name}</span>
          </h1>
          <p className="text-neutral-400">
            Fill out the application form below. Your progress is automatically
            saved.
          </p>
        </div>

        {/* Save Status Indicator */}
        <div className="flex items-center justify-end mb-4 h-6">
          {saveStatus === "saving" && (
            <span className="text-sm text-neutral-500 flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-sm text-green-500 flex items-center gap-2">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-sm text-red-500">Failed to save</span>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Application Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Preferred Systems (Multi-select) */}
          <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5">
            <h2 className="text-xl font-bold text-white mb-2">
              Preferred Systems
            </h2>
            <p className="text-neutral-400 text-sm mb-4">
              Select all systems you are interested in. You may receive interview offers for any of these.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {systemOptions.map((option) => {
                const isSelected = formData.preferredSystems.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[#FFB526]/10 border-[#FFB526]/50 text-white"
                        : "bg-black border-white/10 text-neutral-300 hover:border-white/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
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
                      className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-[#FFB526] focus:ring-[#FFB526] focus:ring-offset-neutral-900"
                    />
                    <span className="font-medium">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Common Questions */}
          <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5">
            <h2 className="text-xl font-bold text-white mb-6">
              About You
            </h2>
            <div className="space-y-6">
              {COMMON_QUESTIONS.map((question) => (
                <div key={question.id}>
                  <label className="block text-sm font-medium text-white mb-2">
                    {question.label}
                    {question.required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>
                  {question.type === "select" ? (
                    <select
                      name={question.id}
                      value={formData[question.id as keyof FormData] as string}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-lg bg-black border border-white/10 text-white focus:border-[#FFB526] focus:outline-none transition-colors"
                    >
                      <option value="">Select...</option>
                      {question.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : question.type === "text" ? (
                    <input
                      type="text"
                      name={question.id}
                      value={formData[question.id as keyof FormData] as string}
                      onChange={handleChange}
                      placeholder={question.placeholder}
                      className="w-full px-4 py-3 rounded-lg bg-black border border-white/10 text-white placeholder-neutral-500 focus:border-[#FFB526] focus:outline-none transition-colors"
                    />
                  ) : (
                    <textarea
                      name={question.id}
                      value={formData[question.id as keyof FormData] as string}
                      onChange={handleChange}
                      placeholder={question.placeholder}
                      rows={4}
                      className="w-full px-4 py-3 rounded-lg bg-black border border-white/10 text-white placeholder-neutral-500 focus:border-[#FFB526] focus:outline-none transition-colors resize-none"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Team-Specific Questions */}
          {teamQuestions.length > 0 && (
            <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5">
              <h2 className="text-xl font-bold text-white mb-6">
                {teamInfo?.name} Specific Questions
              </h2>
              <div className="space-y-6">
                {teamQuestions.map((question) => (
                  <div key={question.id}>
                    <label className="block text-sm font-medium text-white mb-2">
                      {question.label}
                      {question.required && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </label>
                    {question.type === "select" ? (
                      <select
                        value={formData.teamQuestions[question.id] || ""}
                        onChange={(e) =>
                          handleTeamQuestionChange(question.id, e.target.value)
                        }
                        className="w-full px-4 py-3 rounded-lg bg-black border border-white/10 text-white focus:border-red-500 focus:outline-none transition-colors"
                      >
                        <option value="">Select an option...</option>
                        {question.options?.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        value={formData.teamQuestions[question.id] || ""}
                        onChange={(e) =>
                          handleTeamQuestionChange(question.id, e.target.value)
                        }
                        placeholder={question.placeholder}
                        rows={4}
                        className="w-full px-4 py-3 rounded-lg bg-black border border-white/10 text-white placeholder-neutral-500 focus:border-red-500 focus:outline-none transition-colors resize-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resume Upload */}
          <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5">
            <h2 className="text-xl font-bold text-white mb-4">
              Resume (Optional)
            </h2>
            <p className="text-neutral-400 text-sm mb-4">
              Upload your resume in PDF or Word format (max 5MB).
            </p>

            {formData.resumeUrl ? (
              <div className="flex items-center justify-between p-4 rounded-lg bg-black/50 border border-white/10">
                <div className="flex items-center gap-3">
                  <svg
                    className="w-8 h-8 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="text-white text-sm">Resume uploaded</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFormData((prev) => {
                      const newData = { ...prev, resumeUrl: "" };
                      saveFormData(newData);
                      return newData;
                    });
                  }}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Remove
                </button>
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
                <div className="flex items-center justify-center p-8 rounded-lg border-2 border-dashed border-white/20 hover:border-white/40 transition-colors">
                  {uploadProgress !== null ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-48 h-2 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#FFB526] transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <span className="text-sm text-neutral-400">
                        Uploading... {Math.round(uploadProgress)}%
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <svg
                        className="w-8 h-8 text-neutral-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <span className="text-sm text-neutral-400">
                        Click or drag to upload resume
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {uploadError && (
              <p className="mt-2 text-sm text-red-400">{uploadError}</p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={() => saveFormData(formData)}
              disabled={saving}
              className="flex-1 h-12 rounded-lg border border-white/20 text-white font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Save Progress
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 h-12 rounded-lg bg-[#FFB526] text-black font-medium hover:bg-[#e6a220] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Submitting...
                </>
              ) : (
                "Submit Application"
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
