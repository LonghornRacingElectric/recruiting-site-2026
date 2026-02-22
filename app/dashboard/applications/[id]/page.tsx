"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ApplicationStatus } from "@/lib/models/Application";
import { TEAM_INFO } from "@/lib/models/teamQuestions";
import { ApplicationQuestion, RecruitingStep } from "@/lib/models/Config";
import InterviewScheduler from "@/components/InterviewScheduler";
import { useApplication } from "@/hooks/useApplication";
import { useConfig } from "@/hooks/useConfig";

const TEAM_COLORS: Record<string, string> = {
  Electric: "#FFB526",
  Solar: "#FF9404",
  Combustion: "#FFC871",
};

function getStatusInfo(status: ApplicationStatus): { title: string; description: string; color: string; bg: string; border: string } {
  switch (status) {
    case ApplicationStatus.IN_PROGRESS:
      return {
        title: "Application In Progress",
        description: "Your application has not been submitted yet.",
        color: "#facc15",
        bg: "rgba(234,179,8,0.08)",
        border: "rgba(234,179,8,0.15)",
      };
    case ApplicationStatus.SUBMITTED:
      return {
        title: "Application Under Review",
        description: "Your application has been submitted and is being reviewed by our team.",
        color: "#38bdf8",
        bg: "rgba(4,95,133,0.12)",
        border: "rgba(4,95,133,0.25)",
      };
    case ApplicationStatus.INTERVIEW:
      return {
        title: "Interview Stage",
        description: "Congratulations! You've been selected for an interview. Schedule your interview below.",
        color: "#22d3ee",
        bg: "rgba(6,182,212,0.1)",
        border: "rgba(6,182,212,0.2)",
      };
    case ApplicationStatus.TRIAL:
      return {
        title: "Trial Workday Stage",
        description: "You've been invited to a trial workday! Check your dashboard for details.",
        color: "#c084fc",
        bg: "rgba(168,85,247,0.1)",
        border: "rgba(168,85,247,0.2)",
      };
    case ApplicationStatus.ACCEPTED:
      return {
        title: "Application Accepted",
        description: "Congratulations! You've been accepted to the team!",
        color: "#4ade80",
        bg: "rgba(34,197,94,0.1)",
        border: "rgba(34,197,94,0.2)",
      };
    case ApplicationStatus.REJECTED:
      return {
        title: "Application Not Selected",
        description: "Unfortunately, we were not able to move forward with your application at this time.",
        color: "#f87171",
        bg: "rgba(239,68,68,0.08)",
        border: "rgba(239,68,68,0.15)",
      };
    case ApplicationStatus.WAITLISTED:
      return {
        title: "Application Waitlisted",
        description: "You've been placed on the waitlist. We'll notify you if a spot becomes available.",
        color: "#fbbf24",
        bg: "rgba(245,158,11,0.1)",
        border: "rgba(245,158,11,0.2)",
      };
    default:
      return {
        title: "Unknown Status",
        description: "Please contact us if you have questions.",
        color: "rgba(255,255,255,0.4)",
        bg: "rgba(255,255,255,0.04)",
        border: "rgba(255,255,255,0.06)",
      };
  }
}

// Check if interview scheduling is blocked (after trial release)
function isSchedulingBlocked(step: RecruitingStep | null): boolean {
  if (!step) return false;
  const blockedSteps = [
    RecruitingStep.RELEASE_TRIAL,
    RecruitingStep.TRIAL_WORKDAY,
    RecruitingStep.RELEASE_DECISIONS_DAY1,
    RecruitingStep.RELEASE_DECISIONS_DAY2,
    RecruitingStep.RELEASE_DECISIONS_DAY3,
  ];
  return blockedSteps.includes(step);
}

export default function ApplicationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = params.id as string;

  const { application, isLoading: appLoading, error: appError, mutate } = useApplication(applicationId);
  const { recruitingStep, isLoading: configLoading } = useConfig();

  // Dynamic questions from API
  const [commonQuestions, setCommonQuestions] = useState<ApplicationQuestion[]>([]);
  const [teamQuestions, setTeamQuestions] = useState<ApplicationQuestion[]>([]);
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);

  const loading = appLoading || configLoading;
  const error = appError?.message || null;

  // Fetch questions from API when application is loaded
  useEffect(() => {
    if (!application?.team) return;
    const team = application.team;

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
      }
    }

    fetchQuestions();
  }, [application?.team]);

  // Fetch rejection message for rejected applications
  useEffect(() => {
    if (!application?.team || application.status !== ApplicationStatus.REJECTED) {
      setRejectionMessage(null);
      return;
    }

    async function fetchRejectionMessage() {
      try {
        const res = await fetch(`/api/teams`);
        if (res.ok) {
          const data = await res.json();
          const teamConfig = data.teams?.[application!.team];
          if (teamConfig?.rejectionMessage) {
            setRejectionMessage(teamConfig.rejectionMessage);
          }
        }
      } catch (err) {
        console.error("Failed to fetch rejection message:", err);
      }
    }

    fetchRejectionMessage();
  }, [application?.team, application?.status]);

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
  }, [applicationId, router]);

  if (loading) {
    return (
      <main className="min-h-screen pt-24 pb-20" style={{ background: '#030608' }}>
        <div className="container mx-auto px-6 md:px-10 max-w-3xl flex items-center justify-center py-20">
          <svg className="animate-spin h-5 w-5 text-white/20" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </main>
    );
  }

  if (error || !application) {
    return (
      <main className="min-h-screen pt-24 pb-20 relative">
        <div
          className="fixed inset-0 -z-10"
          style={{ background: '#030608' }}
        />
        <div className="container mx-auto px-6 md:px-10 max-w-3xl">
          <div className="text-center py-20">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
            >
              <svg className="w-5 h-5" style={{ color: '#f87171' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">{error || "Application not found"}</h1>
            <p className="font-urbanist text-[14px] text-white/35 mb-6">
              The application you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-[13px] font-semibold tracking-wide transition-all duration-200"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const teamInfo = TEAM_INFO.find((t) => t.team === application.team);
  const statusInfo = getStatusInfo(application.status);
  const teamColor = TEAM_COLORS[teamInfo?.name || "Electric"];

  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: 'radial-gradient(ellipse at 20% 0%, rgba(4,95,133,0.07) 0%, transparent 50%), #030608',
        }}
      />

      <div className="container mx-auto px-6 md:px-10 max-w-3xl">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-white/30 hover:text-white/60 transition-colors duration-200 mb-8"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Dashboard
        </Link>

        {/* Header Card */}
        <div
          className="rounded-xl overflow-hidden mb-6"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Team stripe */}
          <div className="h-1" style={{ backgroundColor: teamColor }} />

          <div className="p-7">
            <div className="flex items-center gap-4 mb-6">
              <div
                className="w-1 h-12 rounded-full shrink-0"
                style={{ backgroundColor: teamColor }}
              />
              <div>
                <h1 className="text-xl font-bold text-white">{teamInfo?.name} Application</h1>
                {application.preferredSystems?.length ? (
                  <p className="font-urbanist text-[13px] text-white/30 mt-0.5">
                    Preferred: {application.preferredSystems.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Status Message */}
            <div
              className="p-4 rounded-lg"
              style={{
                backgroundColor: statusInfo.bg,
                border: `1px solid ${statusInfo.border}`,
              }}
            >
              <h3 className="text-[14px] font-semibold" style={{ color: statusInfo.color }}>
                {statusInfo.title}
              </h3>
              <p className="font-urbanist text-[13px] text-white/40 mt-1 leading-relaxed">
                {application.status === ApplicationStatus.REJECTED && rejectionMessage
                  ? rejectionMessage
                  : statusInfo.description}
              </p>
            </div>
          </div>
        </div>

        {/* Interview Scheduling Section */}
        {application.status === ApplicationStatus.INTERVIEW && !isSchedulingBlocked(recruitingStep) && (
          <InterviewScheduler
            application={application}
            onScheduled={() => { mutate(); }}
          />
        )}

        {/* Submitted Application Data */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="px-7 pt-6 pb-2">
            <h2 className="text-lg font-semibold text-white">Your Submission</h2>
          </div>

          <div className="px-7 pb-7">
            <div className="space-y-0">
              {/* Common Questions */}
              {commonQuestions.map((question) => {
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
                  <div
                    key={question.id}
                    className="py-5"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <h4 className="text-[12px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--lhr-gray-blue)' }}>
                      {question.label}
                    </h4>
                    <p className="font-urbanist text-[14px] text-white/70 whitespace-pre-wrap break-words overflow-hidden leading-relaxed">
                      {value}
                    </p>
                  </div>
                );
              })}

              {/* Team-Specific Questions */}
              {teamQuestions.map((question) => {
                const value = application.formData.teamQuestions?.[question.id];
                if (!value) return null;

                return (
                  <div
                    key={question.id}
                    className="py-5"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <h4 className="text-[12px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--lhr-gray-blue)' }}>
                      {question.label}
                    </h4>
                    <p className="font-urbanist text-[14px] text-white/70 whitespace-pre-wrap break-words overflow-hidden leading-relaxed">
                      {value}
                    </p>
                  </div>
                );
              })}

              {/* Resume */}
              {application.formData.resumeUrl && (
                <div className="py-5">
                  <h4 className="text-[12px] font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--lhr-gray-blue)' }}>
                    Resume
                  </h4>
                  <a
                    href={application.formData.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-[13px] font-medium transition-colors duration-200"
                    style={{ color: 'var(--lhr-gold)' }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
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
