"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ContactPageConfig, ContactChannel } from "@/lib/models/Config";
import { Plus, Trash2, Save, Loader2, Clock } from "lucide-react";

const inputClass =
  "w-full px-3 py-2 rounded-lg text-[13px] text-white placeholder-white/20 focus:outline-none focus:ring-1";
const inputStyle = {
  backgroundColor: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5"
      style={{ color: "var(--lhr-gray-blue)" }}
    >
      {children}
    </label>
  );
}

export function ContactTab() {
  const [config, setConfig] = useState<ContactPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/config/contact");
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
      } else {
        toast.error("Failed to load contact page configuration");
      }
    } catch (err) {
      console.error("Failed to fetch contact config", err);
      toast.error("Failed to load contact page configuration");
    } finally {
      setLoading(false);
    }
  };

  const update = (field: keyof ContactPageConfig, value: string) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateChannel = (index: number, field: keyof ContactChannel, value: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const channels = [...prev.channels];
      channels[index] = { ...channels[index], [field]: value };
      return { ...prev, channels };
    });
  };

  const addChannel = () => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            channels: [
              ...prev.channels,
              { id: `channel_${Date.now()}`, name: "", handle: "", url: "", description: "" },
            ],
          }
        : prev
    );
  };

  const removeChannel = (index: number) => {
    setConfig((prev) =>
      prev ? { ...prev, channels: prev.channels.filter((_, i) => i !== index) } : prev
    );
  };

  const save = async () => {
    if (!config) return;

    if (!config.email.trim()) {
      toast.error("Email is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/config/contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        toast.success("Contact page updated!");
        fetchConfig();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to save");
      }
    } catch (err) {
      console.error("Failed to save contact config", err);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-10">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--lhr-blue)" }} />
        <span className="font-urbanist text-[13px] text-white/30">Loading contact page...</span>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-montserrat text-[16px] font-bold text-white mb-1">Contact Page</h2>
          <p className="font-urbanist text-[13px] text-white/30">
            Controls the content on <span className="text-white/50">/contact</span>. Only
            administrators can edit this.
          </p>
          <div
            className="inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-md text-[11px] font-medium"
            style={{ backgroundColor: "rgba(255,181,38,0.06)", border: "1px solid rgba(255,181,38,0.12)", color: "rgba(255,181,38,0.6)" }}
          >
            <Clock className="h-3 w-3" />
            Changes may take up to 15 minutes to appear on the public page due to caching.
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 inline-flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-40 cursor-pointer"
          style={{ backgroundColor: "var(--lhr-gold)", color: "#000" }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {config.updatedAt && (
        <div className="flex items-center gap-1.5 font-urbanist text-[11px] text-white/25">
          <Clock className="h-3 w-3" />
          Last updated {new Date(config.updatedAt).toLocaleString()}
        </div>
      )}

      {/* Intro */}
      <div
        className="rounded-lg p-4 space-y-3"
        style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div>
          <FieldLabel>Intro paragraph</FieldLabel>
          <textarea
            value={config.intro}
            onChange={(e) => update("intro", e.target.value)}
            rows={2}
            className={`${inputClass} resize-y font-urbanist`}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Email */}
      <div
        className="rounded-lg p-4 space-y-3"
        style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div>
          <FieldLabel>Email address</FieldLabel>
          <input
            type="email"
            value={config.email}
            onChange={(e) => update("email", e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Email description</FieldLabel>
          <input
            type="text"
            value={config.emailDescription}
            onChange={(e) => update("emailDescription", e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Channels */}
      <div className="space-y-3">
        <p className="font-urbanist text-[12px] text-white/40">
          Social channels shown below the email card. Known names (Instagram, LinkedIn) get their
          own icon; anything else gets a generic link icon.
        </p>
        {config.channels.map((channel, index) => (
          <div
            key={channel.id}
            className="rounded-lg p-4"
            style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                <div>
                  <FieldLabel>Name</FieldLabel>
                  <input
                    type="text"
                    value={channel.name}
                    onChange={(e) => updateChannel(index, "name", e.target.value)}
                    placeholder="Instagram"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <FieldLabel>Handle / display text</FieldLabel>
                  <input
                    type="text"
                    value={channel.handle}
                    onChange={(e) => updateChannel(index, "handle", e.target.value)}
                    placeholder="@longhornracing"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>URL</FieldLabel>
                  <input
                    type="url"
                    value={channel.url}
                    onChange={(e) => updateChannel(index, "url", e.target.value)}
                    placeholder="https://..."
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Description</FieldLabel>
                  <input
                    type="text"
                    value={channel.description}
                    onChange={(e) => updateChannel(index, "description", e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>
              <button
                onClick={() => removeChannel(index)}
                aria-label="Remove channel"
                className="shrink-0 p-2 rounded-md transition-colors cursor-pointer"
                style={{ color: "rgba(239,68,68,0.6)" }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={addChannel}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
        >
          <Plus className="h-4 w-4" />
          Add Channel
        </button>
      </div>

      {/* CTA */}
      <div
        className="rounded-lg p-4 space-y-3"
        style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div>
          <FieldLabel>Bottom CTA heading</FieldLabel>
          <input
            type="text"
            value={config.ctaHeading}
            onChange={(e) => update("ctaHeading", e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Bottom CTA text</FieldLabel>
          <textarea
            value={config.ctaText}
            onChange={(e) => update("ctaText", e.target.value)}
            rows={2}
            className={`${inputClass} resize-y font-urbanist`}
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
}
