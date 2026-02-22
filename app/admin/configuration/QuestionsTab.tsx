"use client";

import { useState, useEffect } from "react";
import { User, UserRole, Team } from "@/lib/models/User";
import { ApplicationQuestion, ApplicationQuestionsConfig } from "@/lib/models/Config";
import { Plus, Trash2, Save, GripVertical, ChevronDown, ChevronRight, Loader2, Clock, Info } from "lucide-react";
import toast from "react-hot-toast";

interface QuestionsTabProps {
  userData: User;
}

const teamColors: Record<string, string> = {
  [Team.ELECTRIC]: "var(--lhr-blue)",
  [Team.SOLAR]: "var(--lhr-gold)",
  [Team.COMBUSTION]: "var(--lhr-orange)",
};

const optionStyle = { backgroundColor: "#0c1218", color: "white" };

export function QuestionsTab({ userData }: QuestionsTabProps) {
  const [config, setConfig] = useState<ApplicationQuestionsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    common: true,
  });

  const isAdmin = userData.role === UserRole.ADMIN;
  const isTeamCaptain = userData.role === UserRole.TEAM_CAPTAIN_OB;
  const isSystemLead = userData.role === UserRole.SYSTEM_LEAD;
  const userTeam = userData.memberProfile?.team;
  const userSystem = userData.memberProfile?.system;

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await fetch("/api/admin/config/questions");
      if (!res.ok) throw new Error("Failed to fetch questions");
      const data = await res.json();
      setConfig(data.config);

      const defaultExpanded: Record<string, boolean> = { common: isAdmin };
      if (isTeamCaptain && userTeam) {
        defaultExpanded[userTeam] = true;
      }
      if (isSystemLead && userSystem) {
        defaultExpanded[userSystem] = true;
      }
      if (isAdmin) {
        Object.values(Team).forEach(team => {
          defaultExpanded[team] = false;
        });
      }
      setExpandedSections(defaultExpanded);
    } catch (error) {
      console.error("Error fetching questions:", error);
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const canEditCommon = isAdmin;
  const canEditTeam = (team: string) => isAdmin || (isTeamCaptain && team === userTeam);
  const canEditSystem = (system: string) => isAdmin || (isSystemLead && system === userSystem);

  const updateQuestion = (
    scope: "common" | "team" | "system",
    key: string,
    index: number,
    field: keyof ApplicationQuestion,
    value: string | boolean | string[] | number | undefined
  ) => {
    if (!config) return;

    setConfig(prev => {
      if (!prev) return prev;

      if (scope === "common") {
        const newQuestions = [...prev.commonQuestions];
        newQuestions[index] = { ...newQuestions[index], [field]: value };
        return { ...prev, commonQuestions: newQuestions };
      } else if (scope === "team") {
        const newTeamQuestions = { ...prev.teamQuestions };
        newTeamQuestions[key] = [...(newTeamQuestions[key] || [])];
        newTeamQuestions[key][index] = { ...newTeamQuestions[key][index], [field]: value };
        return { ...prev, teamQuestions: newTeamQuestions };
      } else {
        const newSystemQuestions = { ...prev.systemQuestions };
        newSystemQuestions[key] = [...(newSystemQuestions[key] || [])];
        newSystemQuestions[key][index] = { ...newSystemQuestions[key][index], [field]: value };
        return { ...prev, systemQuestions: newSystemQuestions };
      }
    });
  };

  const addQuestion = (scope: "common" | "team" | "system", key?: string) => {
    if (!config) return;

    const newQuestion: ApplicationQuestion = {
      id: `q_${Date.now()}`,
      label: "",
      type: "text",
      required: false,
      placeholder: "",
    };

    setConfig(prev => {
      if (!prev) return prev;

      if (scope === "common") {
        return { ...prev, commonQuestions: [...prev.commonQuestions, newQuestion] };
      } else if (scope === "team" && key) {
        const newTeamQuestions = { ...prev.teamQuestions };
        newTeamQuestions[key] = [...(newTeamQuestions[key] || []), newQuestion];
        return { ...prev, teamQuestions: newTeamQuestions };
      } else if (scope === "system" && key) {
        const newSystemQuestions = { ...prev.systemQuestions };
        newSystemQuestions[key] = [...(newSystemQuestions[key] || []), newQuestion];
        return { ...prev, systemQuestions: newSystemQuestions };
      }
      return prev;
    });
  };

  const removeQuestion = (scope: "common" | "team" | "system", key: string, index: number) => {
    if (!config) return;

    setConfig(prev => {
      if (!prev) return prev;

      if (scope === "common") {
        const newQuestions = prev.commonQuestions.filter((_, i) => i !== index);
        return { ...prev, commonQuestions: newQuestions };
      } else if (scope === "team") {
        const newTeamQuestions = { ...prev.teamQuestions };
        newTeamQuestions[key] = newTeamQuestions[key].filter((_, i) => i !== index);
        return { ...prev, teamQuestions: newTeamQuestions };
      } else {
        const newSystemQuestions = { ...prev.systemQuestions };
        newSystemQuestions[key] = newSystemQuestions[key].filter((_, i) => i !== index);
        return { ...prev, systemQuestions: newSystemQuestions };
      }
    });
  };

  const saveSection = async (scope: "common" | "team" | "system", key?: string) => {
    if (!config) return;
    setSaving(true);

    try {
      const body: Record<string, unknown> = { scope };

      if (scope === "common") {
        body.questions = config.commonQuestions;
      } else if (scope === "team" && key) {
        body.team = key;
        body.questions = config.teamQuestions[key] || [];
      } else if (scope === "system" && key) {
        body.system = key;
        body.questions = config.systemQuestions?.[key] || [];
      }

      const res = await fetch("/api/admin/config/questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      toast.success("Questions saved successfully");
    } catch (error) {
      console.error("Error saving questions:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save questions");
    } finally {
      setSaving(false);
    }
  };

  const renderQuestionEditor = (
    question: ApplicationQuestion,
    index: number,
    scope: "common" | "team" | "system",
    key: string,
    canEdit: boolean
  ) => (
    <div
      key={question.id}
      className="rounded-lg p-4"
      style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
    >
      <div className="flex items-start gap-3">
        <div className="text-white/15 cursor-move pt-1">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>
                Question Label
              </label>
              <input
                type="text"
                value={question.label}
                onChange={(e) => updateQuestion(scope, key, index, "label", e.target.value)}
                disabled={!canEdit}
                className="w-full h-9 rounded-lg px-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none disabled:opacity-40"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                placeholder="Enter question label..."
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>
                Type
              </label>
              <div className="relative">
                <select
                  value={question.type}
                  onChange={(e) => updateQuestion(scope, key, index, "type", e.target.value)}
                  disabled={!canEdit}
                  className="w-full h-9 rounded-lg px-3 pr-9 text-[13px] font-urbanist text-white appearance-none focus:outline-none disabled:opacity-40"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <option value="text" style={optionStyle}>Short Text</option>
                  <option value="textarea" style={optionStyle}>Long Text</option>
                  <option value="select" style={optionStyle}>Dropdown</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-white/20" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>
                Placeholder
              </label>
              <input
                type="text"
                value={question.placeholder || ""}
                onChange={(e) => updateQuestion(scope, key, index, "placeholder", e.target.value)}
                disabled={!canEdit}
                className="w-full h-9 rounded-lg px-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none disabled:opacity-40"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                placeholder="Optional placeholder text..."
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div
                  className="w-7 h-4 rounded-full relative transition-colors duration-200"
                  style={{ backgroundColor: question.required ? "var(--lhr-blue)" : "rgba(255,255,255,0.10)" }}
                  onClick={() => { if (canEdit) updateQuestion(scope, key, index, "required", !question.required); }}
                >
                  <div
                    className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200"
                    style={{ left: question.required ? "14px" : "2px" }}
                  />
                </div>
                <span className="font-urbanist text-[13px] text-white/40">Required</span>
              </label>
            </div>
          </div>

          {(question.type === "text" || question.type === "textarea") && (
            <div>
              <label className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>
                Max Word Count (optional)
              </label>
              <input
                type="number"
                min={1}
                value={question.maxWordCount || ""}
                onChange={(e) => updateQuestion(scope, key, index, "maxWordCount", e.target.value ? parseInt(e.target.value) : undefined)}
                disabled={!canEdit}
                className="w-full h-9 rounded-lg px-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none disabled:opacity-40"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                placeholder="No limit"
              />
            </div>
          )}

          {question.type === "select" && (
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>
                  Options (comma-separated)
                </label>
                <input
                  type="text"
                  value={question.options?.join(", ") || ""}
                  onChange={(e) => updateQuestion(scope, key, index, "options", e.target.value.split(","))}
                  onBlur={(e) => updateQuestion(scope, key, index, "options", e.target.value.split(",").map(s => s.trim()).filter(s => s))}
                  disabled={!canEdit}
                  className="w-full h-9 rounded-lg px-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none disabled:opacity-40"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                  placeholder="Option 1, Option 2, Option 3..."
                />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div
                  className="w-7 h-4 rounded-full relative transition-colors duration-200"
                  style={{ backgroundColor: question.allowOther ? "var(--lhr-blue)" : "rgba(255,255,255,0.10)" }}
                  onClick={() => { if (canEdit) updateQuestion(scope, key, index, "allowOther", !question.allowOther); }}
                >
                  <div
                    className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200"
                    style={{ left: question.allowOther ? "14px" : "2px" }}
                  />
                </div>
                <span className="font-urbanist text-[12px] text-white/35">
                  Allow &quot;Other&quot; option (adds a text input for custom answers)
                </span>
              </label>
            </div>
          )}
        </div>

        {canEdit && (
          <button
            onClick={() => removeQuestion(scope, key, index)}
            className="p-1.5 transition-colors duration-150"
            style={{ color: "rgba(255,255,255,0.15)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.15)"; }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );

  const renderSection = (
    title: string,
    questions: ApplicationQuestion[],
    scope: "common" | "team" | "system",
    key: string,
    canEdit: boolean,
    color?: string
  ) => {
    const isExpanded = expandedSections[key] ?? false;

    return (
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderLeft: color ? `3px solid ${color}` : undefined,
        }}
      >
        <button
          onClick={() => toggleSection(key)}
          className="w-full flex items-center justify-between p-4 transition-colors duration-150"
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <div className="flex items-center gap-3">
            {isExpanded
              ? <ChevronDown className="h-4 w-4 text-white/30" />
              : <ChevronRight className="h-4 w-4 text-white/30" />
            }
            <span className="font-montserrat text-[14px] font-semibold text-white/80">{title}</span>
            <span className="text-[12px] font-urbanist text-white/25">({questions.length} questions)</span>
          </div>
          {canEdit && (
            <span
              className="text-[10px] font-semibold tracking-widest uppercase px-2 py-1 rounded"
              style={{ backgroundColor: "rgba(4,95,133,0.10)", color: "var(--lhr-blue-light)", border: "1px solid rgba(4,95,133,0.20)" }}
            >
              Can Edit
            </span>
          )}
        </button>

        {isExpanded && (
          <div className="p-4 pt-0 space-y-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="space-y-3 mt-4">
              {questions.map((q, i) => renderQuestionEditor(q, i, scope, key, canEdit))}
            </div>

            {canEdit && (
              <div className="flex items-center justify-between pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <button
                  onClick={() => addQuestion(scope, key)}
                  className="flex items-center gap-2 text-[13px] font-medium transition-colors"
                  style={{ color: "var(--lhr-blue-light)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--lhr-blue)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--lhr-blue-light)"; }}
                >
                  <Plus className="h-4 w-4" />
                  Add Question
                </button>
                <button
                  onClick={() => saveSection(scope, key)}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-50"
                  style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--lhr-blue)" }} />
          <span className="font-urbanist text-[13px] text-white/30">Loading questions...</span>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center p-12 font-urbanist text-[14px] text-white/25">
        Failed to load questions configuration.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-montserrat text-[22px] font-bold text-white mb-1.5">Application Questions</h2>
          <p className="font-urbanist text-[14px] text-white/35">
            Configure the questions shown on application forms. Resume upload is always required.
          </p>
          <div
            className="inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-md text-[11px] font-medium"
            style={{ backgroundColor: "rgba(255,181,38,0.06)", border: "1px solid rgba(255,181,38,0.12)", color: "rgba(255,181,38,0.6)" }}
          >
            <Clock className="h-3 w-3" />
            Changes may take up to 2 hours to appear for applicants due to caching.
          </div>
        </div>
      </div>

      {/* Info Banner for non-admins */}
      {!isAdmin && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl text-[13px] font-urbanist"
          style={{ backgroundColor: "rgba(4,95,133,0.06)", border: "1px solid rgba(4,95,133,0.12)", color: "var(--lhr-blue-light)" }}
        >
          <Info className="h-4 w-4 shrink-0" />
          <span>
            {isTeamCaptain && (
              <>You can edit questions for your team: <strong>{userTeam}</strong></>
            )}
            {isSystemLead && (
              <>You can edit system-specific questions for: <strong>{userSystem}</strong></>
            )}
          </span>
        </div>
      )}

      {/* Common Questions */}
      {(isAdmin || config.commonQuestions.length > 0) && (
        renderSection(
          "Common Questions (All Applications)",
          config.commonQuestions,
          "common",
          "common",
          canEditCommon
        )
      )}

      {/* Team Questions */}
      <div className="space-y-4">
        <h3
          className="text-[11px] font-semibold tracking-widest uppercase"
          style={{ color: "var(--lhr-gray-blue)" }}
        >
          Team-Specific Questions
        </h3>
        {Object.values(Team).map(team => {
          const questions = config.teamQuestions[team] || [];
          if (!isAdmin && team !== userTeam && questions.length === 0) return null;

          return (
            <div key={team}>
              {renderSection(
                `${team} Team`,
                questions,
                "team",
                team,
                canEditTeam(team),
                teamColors[team]
              )}
            </div>
          );
        })}
      </div>

      {/* System Questions */}
      {config.systemQuestions && Object.keys(config.systemQuestions).length > 0 && (
        <div className="space-y-4">
          <h3
            className="text-[11px] font-semibold tracking-widest uppercase"
            style={{ color: "var(--lhr-gray-blue)" }}
          >
            System-Specific Questions
          </h3>
          {Object.entries(config.systemQuestions).map(([system, questions]) => {
            if (!isAdmin && system !== userSystem && questions.length === 0) return null;

            return (
              <div key={system}>
                {renderSection(
                  `${system} System`,
                  questions,
                  "system",
                  system,
                  canEditSystem(system)
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
