"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AboutPageConfig, AboutSection } from "@/lib/models/Config";
import { Save, Plus, Trash2, Edit2, X, GripVertical, Loader2, Clock } from "lucide-react";

export function AboutTab() {
  const [config, setConfig] = useState<AboutPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingMission, setEditingMission] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftSubtitle, setDraftSubtitle] = useState("");
  const [draftMission, setDraftMission] = useState("");
  const [draftSection, setDraftSection] = useState<Partial<AboutSection>>({});

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/config/about");
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
      }
    } catch (err) {
      console.error("Failed to fetch about config", err);
      toast.error("Failed to load about page configuration");
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (updates: Partial<AboutPageConfig>) => {
    if (!config) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/config/about", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, ...updates }),
      });

      if (res.ok) {
        toast.success("About page updated!");
        setConfig({ ...config, ...updates } as AboutPageConfig);
        setEditingTitle(false);
        setEditingMission(false);
        setEditingSection(null);
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to save");
      }
    } catch (err) {
      console.error("Failed to save config", err);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const startEditTitle = () => {
    setDraftTitle(config?.title || "");
    setDraftSubtitle(config?.subtitle || "");
    setEditingTitle(true);
  };

  const startEditMission = () => {
    setDraftMission(config?.missionStatement || "");
    setEditingMission(true);
  };

  const startEditSection = (section: AboutSection) => {
    setDraftSection({ ...section });
    setEditingSection(section.id);
  };

  const addSection = () => {
    const newSection: AboutSection = {
      id: `section_${Date.now()}`,
      title: "New Section",
      content: "Section content here...",
      order: (config?.sections?.length || 0) + 1,
    };
    const newSections = [...(config?.sections || []), newSection];
    saveConfig({ sections: newSections });
  };

  const deleteSection = (id: string) => {
    if (!confirm("Delete this section?")) return;
    const newSections = (config?.sections || []).filter(s => s.id !== id);
    saveConfig({ sections: newSections });
  };

  const saveSectionEdit = () => {
    if (!editingSection || !draftSection.id) return;
    const newSections = (config?.sections || []).map(s =>
      s.id === draftSection.id ? { ...s, ...draftSection } as AboutSection : s
    );
    saveConfig({ sections: newSections });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--lhr-blue)" }} />
          <span className="font-urbanist text-[13px] text-white/30">Loading about page configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-montserrat text-[22px] font-bold text-white mb-1.5">About Page</h2>
          <p className="font-urbanist text-[14px] text-white/35">
            Manage the public About page content. Only administrators can edit this.
          </p>
          <div
            className="inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-md text-[11px] font-medium"
            style={{ backgroundColor: "rgba(255,181,38,0.06)", border: "1px solid rgba(255,181,38,0.12)", color: "rgba(255,181,38,0.6)" }}
          >
            <Clock className="h-3 w-3" />
            Changes may take up to 15 minutes to appear on the public page due to caching.
          </div>
        </div>
      </div>

      {/* Title & Subtitle */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--lhr-gray-blue)" }}>
            Title & Subtitle
          </h3>
          {!editingTitle && (
            <button
              onClick={startEditTitle}
              className="flex items-center gap-1 text-[12px] font-medium transition-colors"
              style={{ color: "var(--lhr-blue-light)" }}
            >
              <Edit2 className="h-3 w-3" /> Edit
            </button>
          )}
        </div>

        {editingTitle ? (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>Title</label>
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white focus:outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>Subtitle</label>
              <input
                type="text"
                value={draftSubtitle}
                onChange={(e) => setDraftSubtitle(e.target.value)}
                className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white focus:outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => saveConfig({ title: draftTitle, subtitle: draftSubtitle })}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
              >
                <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditingTitle(false)}
                className="px-4 py-2 rounded-lg text-[13px] font-medium"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="font-montserrat text-[18px] font-bold text-white">{config?.title}</p>
            <p className="font-urbanist text-[14px] mt-1" style={{ color: "var(--lhr-gold)" }}>
              {config?.subtitle || "(No subtitle)"}
            </p>
          </div>
        )}
      </div>

      {/* Mission Statement */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--lhr-gray-blue)" }}>
            Mission Statement
          </h3>
          {!editingMission && (
            <button
              onClick={startEditMission}
              className="flex items-center gap-1 text-[12px] font-medium transition-colors"
              style={{ color: "var(--lhr-blue-light)" }}
            >
              <Edit2 className="h-3 w-3" /> Edit
            </button>
          )}
        </div>

        {editingMission ? (
          <div className="space-y-4">
            <textarea
              value={draftMission}
              onChange={(e) => setDraftMission(e.target.value)}
              rows={4}
              className="w-full rounded-lg px-4 py-3 text-[13px] font-urbanist text-white focus:outline-none resize-none"
              style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => saveConfig({ missionStatement: draftMission })}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
              >
                <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditingMission(false)}
                className="px-4 py-2 rounded-lg text-[13px] font-medium"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="font-urbanist text-[14px] text-white/50">{config?.missionStatement || "(No mission statement)"}</p>
        )}
      </div>

      {/* Sections */}
      <div
        className="rounded-xl p-6"
        style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--lhr-gray-blue)" }}>
            Sections
          </h3>
          <button
            onClick={addSection}
            className="flex items-center gap-1 text-[12px] font-medium transition-colors"
            style={{ color: "var(--lhr-blue-light)" }}
          >
            <Plus className="h-3 w-3" /> Add Section
          </button>
        </div>

        <div className="space-y-4">
          {(config?.sections || []).sort((a, b) => a.order - b.order).map((section) => (
            <div
              key={section.id}
              className="p-4 rounded-lg"
              style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
            >
              {editingSection === section.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={draftSection.title || ""}
                    onChange={(e) => setDraftSection({ ...draftSection, title: e.target.value })}
                    placeholder="Section title"
                    className="w-full h-9 rounded-lg px-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                  <textarea
                    value={draftSection.content || ""}
                    onChange={(e) => setDraftSection({ ...draftSection, content: e.target.value })}
                    rows={4}
                    placeholder="Section content"
                    className="w-full rounded-lg px-4 py-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none resize-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveSectionEdit}
                      disabled={saving}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50"
                      style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
                    >
                      <Save className="h-3 w-3" /> Save
                    </button>
                    <button
                      onClick={() => setEditingSection(null)}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                      style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-montserrat text-[13px] font-semibold text-white/80">{section.title}</h4>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEditSection(section)}
                        className="p-1.5 transition-colors"
                        style={{ color: "rgba(255,255,255,0.2)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteSection(section.id)}
                        className="p-1.5 transition-colors"
                        style={{ color: "rgba(255,255,255,0.2)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="font-urbanist text-[13px] text-white/35 line-clamp-2">{section.content}</p>
                </div>
              )}
            </div>
          ))}

          {(!config?.sections || config.sections.length === 0) && (
            <p className="font-urbanist text-[13px] text-white/25 text-center py-4">No sections yet. Add one above.</p>
          )}
        </div>
      </div>
    </div>
  );
}
