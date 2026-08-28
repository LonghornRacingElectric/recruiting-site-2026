"use client";

import { useState } from "react";
import { InterviewSlotConfig } from "@/lib/models/Interview";
import { updateInterviewConfig } from "@/lib/actions/interview-config";
import { Link2, Save, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import clsx from "clsx";

interface Props {
  config: InterviewSlotConfig;
}

export function InterviewConfigForm({ config }: Props) {
  const [formData, setFormData] = useState<InterviewSlotConfig>(config);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (value: string) => {
    setFormData((prev) => ({ ...prev, signupLink: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (formData.signupLink && !/^https?:\/\//i.test(formData.signupLink)) {
      toast.error("Signup link must start with http:// or https://");
      return;
    }

    setIsSaving(true);
    try {
      await updateInterviewConfig(formData);
      toast.success("Configuration saved successfully");
      setHasChanges(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="p-5 flex justify-between items-center"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-1.5 h-8 rounded-full"
            style={{ backgroundColor: "var(--lhr-gold)" }}
          />
          <div>
            <h2 className="font-montserrat text-[17px] font-bold text-white">
              {config.team} — {config.system}
            </h2>
            <p className="font-urbanist text-[12px] text-white/25 mt-0.5">
              ID: {config.id}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          // Disabled state uses classes so the light theme can remap it; the
          // inline rgba it had before was invisible on a white card.
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200",
            !hasChanges && "bg-white/5 border border-white/10 text-white/30"
          )}
          style={{
            backgroundColor: hasChanges ? "var(--lhr-blue)" : undefined,
            color: hasChanges ? "white" : undefined,
            cursor: hasChanges ? "pointer" : "not-allowed",
          }}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      <div className="p-6">
        <label
          className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest uppercase mb-2"
          style={{ color: "var(--lhr-gray-blue)" }}
        >
          <Link2 className="h-3.5 w-3.5" /> Signup Link
        </label>
        <input
          type="url"
          value={formData.signupLink}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="https://calendar.app.google/..."
          className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none transition-colors"
          style={{
            backgroundColor: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        />
        <p className="font-urbanist text-[11px] text-white/20 mt-2">
          Applicants who select this system will see this link once they reach the interview stage.
        </p>
      </div>
    </div>
  );
}
