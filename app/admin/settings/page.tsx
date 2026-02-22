"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RecruitingConfig, RecruitingStep, Announcement } from "@/lib/models/Config";
import { format } from "date-fns";
import clsx from "clsx";

const STEP_DESCRIPTIONS: Record<RecruitingStep, string> = {
  [RecruitingStep.OPEN]: "Applications are open. Applicants see 'In Progress' or 'Submitted'.",
  [RecruitingStep.REVIEWING]: "Applications effectively closed. All statuses masked as 'Submitted'.",
  [RecruitingStep.RELEASE_INTERVIEWS]: "Applicants can see Interview invites. Rejections masked as 'Submitted'.",
  [RecruitingStep.INTERVIEWING]: "Interviews in progress. Rejections still masked.",
  [RecruitingStep.RELEASE_TRIAL]: "Applicants can see Trial invites. Rejections masked.",
  [RecruitingStep.TRIAL_WORKDAY]: "Trials in progress.",
  [RecruitingStep.RELEASE_DECISIONS_DAY1]: "Day 1: Early acceptances, rejections, and waitlist are visible.",
  [RecruitingStep.RELEASE_DECISIONS_DAY2]: "Day 2: Waitlist updates visible. Some waitlisted applicants may be accepted.",
  [RecruitingStep.RELEASE_DECISIONS_DAY3]: "Day 3: Final decisions. All accepts, rejects, and waitlist resolutions visible.",
};

const inputStyle = {
  backgroundColor: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
};

export default function AdminSettingsPage() {
  const [config, setConfig] = useState<RecruitingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedStep, setSelectedStep] = useState<RecruitingStep | null>(null);

  // Announcement state
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/config/recruiting").then((res) => res.json()),
      fetch("/api/admin/config/announcement").then((res) => res.json())
    ]).then(([recruitingData, announcementData]) => {
      if (recruitingData.config) {
        setConfig(recruitingData.config);
        setSelectedStep(recruitingData.config.currentStep);
      }
      if (announcementData.announcement) {
        setAnnouncement(announcementData.announcement);
        setAnnouncementMessage(announcementData.announcement.message);
        setAnnouncementEnabled(announcementData.announcement.enabled);
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!selectedStep) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config/recruiting", {
        method: "POST",
        body: JSON.stringify({ step: selectedStep }),
      });
      if (res.ok) {
        setConfig((prev) => prev ? { ...prev, currentStep: selectedStep, updatedAt: new Date() } : null);
        toast.success("Recruiting step updated!");
      } else {
        toast.error("Failed to update step.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error updating step.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAnnouncement = async () => {
    setSavingAnnouncement(true);
    try {
      const res = await fetch("/api/admin/config/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: announcementMessage,
          enabled: announcementEnabled
        }),
      });
      if (res.ok) {
        setAnnouncement({
          message: announcementMessage,
          enabled: announcementEnabled,
          updatedAt: new Date(),
          updatedBy: "current-user"
        });
        toast.success("Announcement updated!");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update announcement.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error updating announcement.");
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const hasAnnouncementChanges =
    announcementMessage !== (announcement?.message || "") ||
    announcementEnabled !== (announcement?.enabled || false);

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-20 flex items-center justify-center" style={{ background: '#030608' }}>
        <svg className="animate-spin h-5 w-5 text-white/20" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-20 relative">
      <div
        className="fixed inset-0 -z-10"
        style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(4,95,133,0.07) 0%, transparent 50%), #030608' }}
      />

      <div className="container mx-auto px-6 md:px-10 max-w-3xl">
        {/* Page Header */}
        <div className="mb-10">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--lhr-gray-blue)' }}>
            Admin
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Settings</h1>
        </div>

        {/* Recruiting Lifecycle */}
        <div
          className="rounded-xl overflow-hidden mb-4"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="p-7">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,148,4,0.1)' }}>
                <svg className="w-4 h-4" style={{ color: 'var(--lhr-orange)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Recruiting Lifecycle</h2>
            </div>

            <div className="mb-6">
              <label className="block text-[12px] font-semibold tracking-widest uppercase mb-2.5" style={{ color: 'var(--lhr-gray-blue)' }}>
                Current Global Step
              </label>
              <div className="relative">
                <select
                  value={selectedStep || ""}
                  onChange={(e) => setSelectedStep(e.target.value as RecruitingStep)}
                  className="w-full rounded-lg px-4 py-3 text-[14px] text-white appearance-none focus:outline-none focus:ring-1 font-urbanist"
                  style={{ ...inputStyle, outlineColor: 'var(--lhr-blue)' }}
                >
                  {Object.values(RecruitingStep).map((step) => (
                    <option key={step} value={step} style={{ backgroundColor: '#0c1218' }}>
                      {step.replace(/_/g, " ").toUpperCase()}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 text-xs">
                  ▼
                </div>
              </div>
            </div>

            {selectedStep && (
              <div
                className="mb-6 p-4 rounded-lg"
                style={{ backgroundColor: 'rgba(255,148,4,0.06)', border: '1px solid rgba(255,148,4,0.12)' }}
              >
                <h3 className="text-[13px] font-semibold mb-1" style={{ color: 'var(--lhr-orange)' }}>
                  Impact on Visibility
                </h3>
                <p className="font-urbanist text-[13px] text-white/40 leading-relaxed">
                  {STEP_DESCRIPTIONS[selectedStep]}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="font-urbanist text-[11px] text-white/15">
                Last updated: {config?.updatedAt ? format(new Date(config.updatedAt), "PPpp") : "Never"}
              </span>
              <button
                onClick={handleSave}
                disabled={saving || selectedStep === config?.currentStep}
                className="h-9 px-5 rounded-lg text-[12px] font-semibold tracking-wide transition-all duration-200 disabled:opacity-30"
                style={{ backgroundColor: 'var(--lhr-blue)', color: '#fff' }}
              >
                {saving ? "Saving..." : "Update Step"}
              </button>
            </div>
          </div>
        </div>

        {/* Custom Announcement */}
        <div
          className="rounded-xl overflow-hidden mb-4"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="p-7">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,181,38,0.1)' }}>
                <svg className="w-4 h-4" style={{ color: 'var(--lhr-gold)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Custom Announcement</h2>
            </div>
            <p className="font-urbanist text-[13px] text-white/30 mb-6">
              Display a custom message on the applicant dashboard. Only visible when enabled.
            </p>

            <div className="space-y-5">
              <div>
                <label className="block text-[12px] font-semibold tracking-widest uppercase mb-2.5" style={{ color: 'var(--lhr-gray-blue)' }}>
                  Message
                </label>
                <textarea
                  value={announcementMessage}
                  onChange={(e) => setAnnouncementMessage(e.target.value)}
                  placeholder="Enter your announcement message here..."
                  className="w-full h-28 p-4 rounded-lg text-[14px] text-white placeholder-white/15 focus:outline-none focus:ring-1 font-urbanist resize-none leading-relaxed"
                  style={{ ...inputStyle, outlineColor: 'var(--lhr-blue)' }}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAnnouncementEnabled(!announcementEnabled)}
                  className="relative w-11 h-6 rounded-full transition-colors duration-200"
                  style={{
                    backgroundColor: announcementEnabled ? 'var(--lhr-blue)' : 'rgba(255,255,255,0.08)',
                  }}
                >
                  <span
                    className={clsx(
                      "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200",
                      announcementEnabled && "translate-x-5"
                    )}
                  />
                </button>
                <span className="font-urbanist text-[13px] text-white/40">
                  {announcementEnabled ? "Visible to applicants" : "Hidden from applicants"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-5 mt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="font-urbanist text-[11px] text-white/15">
                Last updated: {announcement?.updatedAt ? format(new Date(announcement.updatedAt), "PPpp") : "Never"}
              </span>
              <button
                onClick={handleSaveAnnouncement}
                disabled={savingAnnouncement || !hasAnnouncementChanges}
                className="h-9 px-5 rounded-lg text-[12px] font-semibold tracking-wide transition-all duration-200 disabled:opacity-30"
                style={{ backgroundColor: 'var(--lhr-blue)', color: '#fff' }}
              >
                {savingAnnouncement ? "Saving..." : "Save Announcement"}
              </button>
            </div>
          </div>
        </div>

        {/* Developer Tools */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="p-7">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Developer Tools</h2>
            </div>
            <p className="font-urbanist text-[13px] text-white/30 mb-6">
              Testing utilities for development. Use with caution.
            </p>

            <div
              className="p-5 rounded-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              <h3 className="text-[14px] font-semibold text-white mb-1">Seed Fake Applications</h3>
              <p className="font-urbanist text-[12px] text-white/25 mb-5 leading-relaxed">
                Generate 1000 fake applications with random teams, systems, and statuses for testing.
                All fake data is flagged for easy cleanup.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    if (!confirm("This will create 1000 fake applications. Continue?")) return;
                    toast.loading("Creating fake applications...", { id: "seed" });
                    try {
                      const res = await fetch("/api/admin/applications/seed", {
                        method: "POST",
                        body: JSON.stringify({ count: 1000 }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        toast.success(data.message, { id: "seed" });
                      } else {
                        toast.error(data.error || "Failed to seed applications", { id: "seed" });
                      }
                    } catch {
                      toast.error("Error seeding applications", { id: "seed" });
                    }
                  }}
                  className="h-9 px-5 rounded-lg text-[12px] font-semibold tracking-wide transition-all duration-200"
                  style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}
                >
                  Generate 1000 Fake Applications
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("This will delete ALL fake applications and users. Continue?")) return;
                    toast.loading("Cleaning up fake data...", { id: "cleanup" });
                    try {
                      const res = await fetch("/api/admin/applications/seed", {
                        method: "DELETE",
                      });
                      const data = await res.json();
                      if (res.ok) {
                        toast.success(data.message, { id: "cleanup" });
                      } else {
                        toast.error(data.error || "Failed to clean up", { id: "cleanup" });
                      }
                    } catch {
                      toast.error("Error cleaning up fake data", { id: "cleanup" });
                    }
                  }}
                  className="h-9 px-5 rounded-lg text-[12px] font-semibold tracking-wide transition-all duration-200"
                  style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}
                >
                  Clean Up Fake Data
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
