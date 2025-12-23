"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Application, ApplicationStatus } from "@/lib/models/Application";
import { TEAM_INFO, TEAM_QUESTIONS, COMMON_QUESTIONS } from "@/lib/models/teamQuestions";
import { RecruitingStep } from "@/lib/models/Config";
import InterviewScheduler from "@/components/InterviewScheduler";

// Stage configuration
const STAGES = [
  { key: "submitted", label: "Submitted" },
  { key: "interview", label: "Interview" },
  { key: "trial", label: "Trial Workday" },
  { key: "decision", label: "Decision" },
];

function getStageIndex(status: ApplicationStatus): number {
  switch (status) {
    case ApplicationStatus.IN_PROGRESS:
    case ApplicationStatus.SUBMITTED:
      return 0;
    case ApplicationStatus.INTERVIEW:
      return 1;
    case ApplicationStatus.TRIAL:
      return 2;
    case ApplicationStatus.ACCEPTED:
    case ApplicationStatus.REJECTED:
      return 3;
    default:
      return 0;
  }
}

function getStatusMessage(status: ApplicationStatus): { title: string; description: string; color: string } {
  switch (status) {
    case ApplicationStatus.IN_PROGRESS:
      return {
        title: "Application In Progress",
        description: "Your application has not been submitted yet.",
        color: "text-yellow-400",
      };
    case ApplicationStatus.SUBMITTED:
      return {
        title: "Application Under Review",
        description: "Your application has been submitted and is being reviewed by our team.",
        color: "text-blue-400",
      };
    case ApplicationStatus.INTERVIEW:
      return {
        title: "Interview Stage",
        description: "Congratulations! You've been selected for an interview. Schedule your interview below.",
        color: "text-cyan-400",
      };
    case ApplicationStatus.TRIAL:
      return {
        title: "Trial Workday Stage",
        description: "You've been invited to a trial workday! Check your dashboard for details.",
        color: "text-purple-400",
      };
    case ApplicationStatus.ACCEPTED:
      return {
        title: "Application Accepted",
        description: "Congratulations! You've been accepted to the team!",
        color: "text-green-400",
      };
    case ApplicationStatus.REJECTED:
      return {
        title: "Application Not Selected",
        description: "Unfortunately, we were not able to move forward with your application at this time.",
        color: "text-red-400",
      };
    default:
      return {
        title: "Unknown Status",
        description: "Please contact us if you have questions.",
        color: "text-neutral-400",
      };
  }
}

// Check if interview scheduling is blocked (after trial release)
function isSchedulingBlocked(step: RecruitingStep | null): boolean {
  if (!step) return false;
  const blockedSteps = [
    RecruitingStep.RELEASE_TRIAL,
    RecruitingStep.TRIAL_WORKDAY,
    RecruitingStep.RELEASE_DECISIONS,
  ];
  return blockedSteps.includes(step);
}

export default function ApplicationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = params.id as string;

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recruitingStep, setRecruitingStep] = useState<RecruitingStep | null>(null);

  useEffect(() => {
    // Check if user is staff - redirect to admin page
    const userRole = document.cookie
      .split("; ")
      .find((row) => row.startsWith("user_role="))
      ?.split("=")[1];

    const staffRoles = ["admin", "team_captain_ob", "system_lead", "reviewer"];
    if (userRole && staffRoles.includes(userRole)) {
      router.replace(`/admin/applications/${applicationId}`);
      return;
    }

    // Fetch application data and recruiting step
    async function fetchData() {
      try {
        const [appRes, configRes] = await Promise.all([
          fetch(`/api/applications/${applicationId}`),
          fetch("/api/config"),
        ]);
        
        if (appRes.ok) {
          const data = await appRes.json();
          setApplication(data.application);
        } else if (appRes.status === 404) {
          setError("Application not found");
        } else if (appRes.status === 403) {
          setError("You don't have permission to view this application");
        } else {
          setError("Failed to load application");
        }
        
        if (configRes.ok) {
          const configData = await configRes.json();
          setRecruitingStep(configData.config?.currentStep || null);
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
        setError("Failed to load application");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [applicationId, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-black pt-24 pb-20">
        <div className="container mx-auto px-4 flex items-center justify-center py-20">
          <svg
            className="animate-spin h-8 w-8 text-neutral-500"
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
        </div>
      </main>
    );
  }

  if (error || !application) {
    return (
      <main className="min-h-screen bg-black pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center py-20">
            <div className="text-4xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-white mb-2">{error || "Application not found"}</h1>
            <p className="text-neutral-400 mb-6">
              The application you're looking for doesn't exist or you don't have permission to view it.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-800 px-6 text-sm font-medium text-white hover:bg-neutral-700 transition-colors"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const teamInfo = TEAM_INFO.find((t) => t.team === application.team);
  const teamQuestions = TEAM_QUESTIONS[application.team] || [];
  const stageIndex = getStageIndex(application.status);
  const statusInfo = getStatusMessage(application.status);

  return (
    <main className="min-h-screen bg-black pt-24 pb-20">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          {/* Back Link */}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-6"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>

          {/* Header */}
          <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5 mb-6">
            <div className="flex items-center gap-4 mb-6">
              <span className="text-4xl">{teamInfo?.icon}</span>
              <div>
                <h1 className="text-2xl font-bold text-white">{teamInfo?.name} Application</h1>
                {application.preferredSystems?.length ? (
                  <p className="text-sm text-neutral-400">
                    Preferred Systems: {application.preferredSystems.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Stage Progress */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                {STAGES.map((stage, index) => (
                  <div key={stage.key} className="flex flex-col items-center flex-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mb-1 ${
                        index <= stageIndex
                          ? "bg-red-600 text-white"
                          : "bg-neutral-800 text-neutral-500"
                      }`}
                    >
                      {index < stageIndex ? "✓" : index + 1}
                    </div>
                    <span
                      className={`text-xs text-center ${
                        index <= stageIndex ? "text-white" : "text-neutral-500"
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="h-1 bg-neutral-800 rounded-full">
                <div
                  className="h-1 bg-red-600 rounded-full transition-all"
                  style={{ width: `${(stageIndex / (STAGES.length - 1)) * 100}%` }}
                />
              </div>
            </div>

            {/* Status Message */}
            <div className="p-4 rounded-lg bg-black/50 border border-white/5">
              <h3 className={`font-semibold ${statusInfo.color}`}>{statusInfo.title}</h3>
              <p className="text-sm text-neutral-400 mt-1">{statusInfo.description}</p>
            </div>
          </div>

          {/* Interview Scheduling Section - only show for interview status and before trial release */}
          {application.status === ApplicationStatus.INTERVIEW && !isSchedulingBlocked(recruitingStep) && (
            <InterviewScheduler
              application={application}
              onScheduled={async () => {
                // Refetch application to update status
                const res = await fetch(`/api/applications/${applicationId}`);
                if (res.ok) {
                  const data = await res.json();
                  setApplication(data.application);
                }
              }}
            />
          )}

          {/* Submitted Application Data */}
          <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5">
            <h2 className="text-xl font-bold text-white mb-6">Your Submission</h2>

            <div className="space-y-6">
              {/* Common Questions */}
              {COMMON_QUESTIONS.map((question) => {
                const value =
                  question.id === "graduationYear"
                    ? application.formData.graduationYear
                    : question.id === "major"
                    ? application.formData.major
                    : question.id === "whyJoin"
                    ? application.formData.whyJoin
                    : question.id === "relevantExperience"
                    ? application.formData.relevantExperience
                    : question.id === "availability"
                    ? application.formData.availability
                    : null;

                if (!value) return null;

                return (
                  <div key={question.id} className="border-b border-white/5 pb-4 last:border-0">
                    <h4 className="text-sm font-medium text-neutral-400 mb-2">{question.label}</h4>
                    <p className="text-white whitespace-pre-wrap">{value}</p>
                  </div>
                );
              })}

              {/* Team-Specific Questions */}
              {teamQuestions.map((question) => {
                const value = application.formData.teamQuestions?.[question.id];
                if (!value) return null;

                return (
                  <div key={question.id} className="border-b border-white/5 pb-4 last:border-0">
                    <h4 className="text-sm font-medium text-neutral-400 mb-2">{question.label}</h4>
                    <p className="text-white whitespace-pre-wrap">{value}</p>
                  </div>
                );
              })}

              {/* Resume */}
              {application.formData.resumeUrl && (
                <div className="border-b border-white/5 pb-4 last:border-0">
                  <h4 className="text-sm font-medium text-neutral-400 mb-2">Resume</h4>
                  <a
                    href={application.formData.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-red-500 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    View Resume
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
