"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RecruitingConfig, RecruitingStep } from "@/lib/models/Config";
import { format } from "date-fns";
import clsx from "clsx";

const STEP_DESCRIPTIONS: Record<RecruitingStep, string> = {
  [RecruitingStep.OPEN]: "Applications are open. Applicants see 'In Progress' or 'Submitted'.",
  [RecruitingStep.REVIEWING]: "Applications effectively closed. All statuses masked as 'Submitted'.",
  [RecruitingStep.RELEASE_INTERVIEWS]: "Applicants can see Interview invites. Rejections masked as 'Submitted'.",
  [RecruitingStep.INTERVIEWING]: "Interviews in progress. Rejections still masked.",
  [RecruitingStep.RELEASE_TRIAL]: "Applicants can see Trial invites. Rejections masked.",
  [RecruitingStep.TRIAL_WORKDAY]: "Trials in progress.",
  [RecruitingStep.RELEASE_DECISIONS]: "All decisions (Accepted/Rejected) are visible to applicants.",
};

export default function AdminSettingsPage() {
  const [config, setConfig] = useState<RecruitingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedStep, setSelectedStep] = useState<RecruitingStep | null>(null);

  useEffect(() => {
    fetch("/api/admin/config/recruiting")
      .then((res) => res.json())
      .then((data) => {
        if (data.config) {
          setConfig(data.config);
          setSelectedStep(data.config.currentStep);
        }
      })
      .finally(() => setLoading(false));
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
        // Update local config
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

  if (loading) return <div className="p-12 text-neutral-500">Loading settings...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">System Settings</h1>
      <p className="text-neutral-400 mb-8">Manage global recruiting configurations.</p>

      <div className="bg-neutral-900 border border-white/5 rounded-xl p-8">
        <h2 className="text-xl font-bold text-white mb-6">Recruiting Lifecycle</h2>
        
        <div className="mb-6">
           <label className="block text-sm font-medium text-neutral-400 mb-2">Current Global Step</label>
           <div className="relative">
             <select
               value={selectedStep || ""}
               onChange={(e) => setSelectedStep(e.target.value as RecruitingStep)}
               className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:outline-none focus:border-orange-500 transition-colors"
             >
               {Object.values(RecruitingStep).map((step) => (
                 <option key={step} value={step}>
                   {step.replace(/_/g, " ").toUpperCase()}
                 </option>
               ))}
             </select>
             <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
               ▼
             </div>
           </div>
        </div>

        {selectedStep && (
            <div className="mb-8 p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <h3 className="text-orange-400 font-bold mb-1">Impact on Visibility</h3>
                <p className="text-neutral-300 text-sm">
                    {STEP_DESCRIPTIONS[selectedStep]}
                </p>
            </div>
        )}
        
        <div className="flex items-center justify-between border-t border-white/5 pt-6">
            <div className="text-xs text-neutral-500">
                Last updated: {config?.updatedAt ? format(new Date(config.updatedAt), "PPpp") : "Never"}
            </div>
            <button
              onClick={handleSave}
              disabled={saving || selectedStep === config?.currentStep}
              className="px-6 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {saving ? "Saving..." : "Update Step"}
            </button>
        </div>
      </div>
    </div>
  );
}
