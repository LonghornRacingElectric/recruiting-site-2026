"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import clsx from "clsx";
import { ScorecardConfig, ScorecardSubmission } from "@/lib/models/Scorecard";
import { Loader2, Save } from "lucide-react";

interface ApplicationScorecardProps {
  applicationId: string;
  currentUserSystem?: string;
  isPrivilegedUser: boolean; // Admin or Captain
}

export default function ApplicationScorecard({
  applicationId,
  currentUserSystem,
  isPrivilegedUser
}: ApplicationScorecardProps) {
  const [scorecardConfig, setScorecardConfig] = useState<ScorecardConfig | null>(null);
  const [scorecardData, setScorecardData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Multi-system state
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [allTeamSystems, setAllTeamSystems] = useState<string[]>([]);
  const [systemsWithConfigs, setSystemsWithConfigs] = useState<string[]>([]);

  // Aggregate state
  const [aggregates, setAggregates] = useState<any>(null);
  const [allSubmissions, setAllSubmissions] = useState<ScorecardSubmission[]>([]);

  // Initial fetch and fetch on system change
  useEffect(() => {
    if (!applicationId) return;

    setLoading(true);
    const systemParam = selectedSystem ? `?system=${encodeURIComponent(selectedSystem)}` : '';

    fetch(`/api/admin/applications/${applicationId}/scorecard${systemParam}`)
      .then(res => res.json())
      .then(data => {
        setScorecardConfig(data.config);
        if (data.submission) {
            setScorecardData(data.submission.data);
        } else {
            setScorecardData({});
        }

        // available systems data
        if (data.allTeamSystems) setAllTeamSystems(data.allTeamSystems);
        if (data.systemsWithConfigs) setSystemsWithConfigs(data.systemsWithConfigs);

        // Auto-select system if not set
        if (data.currentSystem && !selectedSystem) {
            setSelectedSystem(data.currentSystem);
        }

        setAggregates(data.aggregates);
        setAllSubmissions(data.allSubmissions || []);
      })
      .catch(err => console.error("Failed to fetch scorecard", err))
      .finally(() => setLoading(false));
  }, [applicationId, selectedSystem]);

  const handleSystemChange = (newSystem: string) => {
    setSelectedSystem(newSystem);
    setScorecardData({});
    setScorecardConfig(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicationId) return;
    setSaving(true);
    try {
        await fetch(`/api/admin/applications/${applicationId}/scorecard`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                data: scorecardData,
                system: selectedSystem
            }),
        });
        toast.success("Scorecard saved!");
    } catch(e) {
        toast.error("Failed to save scorecard");
    } finally {
        setSaving(false);
    }
  };

  if (loading && !scorecardConfig) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--lhr-orange)" }} />
        <span className="font-urbanist text-[13px] text-white/30">Loading scorecard...</span>
      </div>
    );
  }

  if (!loading && !scorecardConfig) {
    return (
      <div
        className="p-4 rounded-xl"
        style={{ backgroundColor: "rgba(255,148,4,0.06)", border: "1px solid rgba(255,148,4,0.15)" }}
      >
        <p className="font-urbanist text-[13px]" style={{ color: "rgba(255,148,4,0.7)" }}>
          No scorecard configuration found for this team/system.
        </p>
        <a
          href="/admin/configuration?tab=scorecards"
          className="font-urbanist text-[11px] underline mt-1 inline-block"
          style={{ color: "rgba(255,148,4,0.5)" }}
        >
          Create one in Admin → Configuration → Scorecards → Application Scorecards
        </a>
      </div>
    );
  }

  // Guard against null config if still loading
  if (!scorecardConfig) return null;

  return (
    <div className="max-w-2xl space-y-6">
        {/* System Selector for Privileged Users */}
        {isPrivilegedUser && allTeamSystems.length > 1 && (
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
            >
                <label className="block font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--lhr-gray-blue)" }}>
                    Select System Scorecard
                </label>
                <div className="flex flex-wrap gap-2">
                    {allTeamSystems.map(sys => {
                        const hasConfig = systemsWithConfigs.includes(sys);
                        const isSelected = selectedSystem === sys;
                        return (
                            <button
                                key={sys}
                                type="button"
                                onClick={() => handleSystemChange(sys)}
                                className="px-3 py-1.5 font-urbanist text-[12px] font-semibold rounded-lg transition-colors"
                                style={
                                  isSelected
                                    ? { backgroundColor: "rgba(255,148,4,0.12)", border: "1px solid rgba(255,148,4,0.3)", color: "var(--lhr-orange)" }
                                    : hasConfig
                                      ? { backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "white" }
                                      : { backgroundColor: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.25)" }
                                }
                            >
                                {sys}
                                {hasConfig && !isSelected && (
                                    <span className="ml-1 text-[10px]" style={{ color: "rgba(34,197,94,0.7)" }}>●</span>
                                )}
                            </button>
                        );
                    })}
                </div>
                <p className="font-urbanist text-[10px] text-white/15 mt-2">
                    <span style={{ color: "rgba(34,197,94,0.7)" }}>●</span> indicates systems with configured scorecards
                </p>
            </div>
        )}

        {/* Aggregate Scores Display */}
        {aggregates && aggregates.totalSubmissions > 0 && (
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: "rgba(255,148,4,0.04)", border: "1px solid rgba(255,148,4,0.12)" }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-montserrat text-[13px] font-bold text-white">Aggregate Scores</h3>
                    <span className="font-urbanist text-[12px] text-white/30">
                        {aggregates.totalSubmissions} reviewer{aggregates.totalSubmissions !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Overall Weighted Average */}
                {aggregates.overallWeightedAverage !== undefined && (
                    <div
                      className="mb-4 p-3 rounded-lg"
                      style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                    >
                        <div className="flex items-center justify-between">
                            <span className="font-urbanist text-[12px] text-white/35">Overall Weighted Average</span>
                            <span className="font-montserrat text-[22px] font-bold" style={{ color: "var(--lhr-orange)" }}>
                                {aggregates.overallWeightedAverage.toFixed(2)}
                            </span>
                        </div>
                    </div>
                )}

                {/* Individual Field Averages */}
                <div className="space-y-3">
                    {aggregates.scores.map((score: any) => (
                        <div key={score.fieldId} className="flex items-center gap-4">
                            <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-urbanist text-[12px] text-white/60">{score.fieldLabel}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-urbanist text-[12px] font-semibold" style={{ color: "var(--lhr-orange)" }}>
                                            {score.average.toFixed(2)}
                                        </span>
                                        <span className="font-urbanist text-[10px] text-white/20">
                                            / {score.max}
                                        </span>
                                        {score.weight && (
                                            <span className="font-urbanist text-[10px] text-white/15">
                                                (w: {score.weight})
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{ width: `${(score.average / score.max) * 100}%`, background: "linear-gradient(90deg, var(--lhr-orange), var(--lhr-gold))" }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Individual Reviewer Submissions */}
        {allSubmissions.length > 0 && (
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
            >
                <h3 className="font-montserrat text-[13px] font-bold text-white mb-4">Individual Submissions</h3>
                <div className="space-y-3">
                    {allSubmissions.map((sub) => (
                        <div
                            key={sub.id}
                            className="p-3 rounded-lg"
                            style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-urbanist text-[13px] font-semibold text-white/70">{sub.reviewerName}</span>
                                <span className="font-urbanist text-[10px] text-white/15">
                                    {sub.updatedAt ? new Date(sub.updatedAt).toLocaleDateString() : ''}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {scorecardConfig.fields
                                    .filter(f => f.type === "rating")
                                    .map(field => {
                                        const value = sub.data[field.id];
                                        return (
                                            <div
                                                key={field.id}
                                                className="px-2 py-0.5 rounded text-[11px] font-urbanist"
                                                style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}
                                            >
                                                <span className="text-white/30">{field.label}: </span>
                                                <span className="text-white font-semibold">
                                                    {typeof value === 'number' ? value : '-'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                {/* Boolean fields */}
                                {scorecardConfig.fields
                                    .filter(f => f.type === "boolean")
                                    .map(field => {
                                        const value = sub.data[field.id];
                                        return (
                                            <div
                                                key={field.id}
                                                className="px-2 py-0.5 rounded text-[11px] font-urbanist font-semibold"
                                                style={
                                                  value === true
                                                    ? { backgroundColor: "rgba(34,197,94,0.08)", color: "rgba(34,197,94,0.8)", border: "1px solid rgba(34,197,94,0.15)" }
                                                    : value === false
                                                      ? { backgroundColor: "rgba(239,68,68,0.08)", color: "rgba(239,68,68,0.8)", border: "1px solid rgba(239,68,68,0.15)" }
                                                      : { backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.04)" }
                                                }
                                            >
                                                {field.label}: {value === true ? 'Yes' : value === false ? 'No' : '-'}
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* My Scorecard Form */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }} className="pt-6">
            <h3 className="font-montserrat text-[13px] font-bold text-white mb-4">Your Scorecard</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
                {scorecardConfig.fields.map(field => (
                    <div
                      key={field.id}
                      className="p-4 rounded-xl"
                      style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                    >
                        <label className="block font-urbanist text-[13px] font-bold text-white/80 mb-0.5">
                            {field.label} {field.required && <span style={{ color: "rgba(239,68,68,0.7)" }}>*</span>}
                        </label>
                        {field.description && <p className="font-urbanist text-[11px] text-white/25 mb-3">{field.description}</p>}

                        {field.type === "rating" && (
                            <div className="flex items-center gap-3">
                                {[1, 2, 3, 4, 5].map(val => (
                                    <label key={val} className="flex flex-col items-center cursor-pointer group">
                                        <input
                                          type="radio"
                                          name={field.id}
                                          value={val}
                                          checked={scorecardData[field.id] === val}
                                          onChange={() => setScorecardData(prev => ({ ...prev, [field.id]: val }))}
                                          className="hidden"
                                        />
                                        <div
                                          className="w-10 h-10 rounded-full flex items-center justify-center font-montserrat text-[13px] font-bold transition-all"
                                          style={
                                            scorecardData[field.id] === val
                                              ? { backgroundColor: "var(--lhr-orange)", color: "white", border: "1px solid var(--lhr-orange)" }
                                              : { backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.06)" }
                                          }
                                        >
                                            {val}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}

                        {field.type === "text" && (
                            <input
                              type="text"
                              className="w-full h-10 rounded-lg px-3 font-urbanist text-[13px] text-white focus:outline-none"
                              style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                              value={scorecardData[field.id] || ""}
                              onChange={(e) => setScorecardData(prev => ({ ...prev, [field.id]: e.target.value }))}
                            />
                        )}

                        {field.type === "long_text" && (
                            <textarea
                              className="w-full rounded-lg px-3 py-2.5 font-urbanist text-[13px] text-white focus:outline-none resize-none h-24"
                              style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                              value={scorecardData[field.id] || ""}
                              onChange={(e) => setScorecardData(prev => ({ ...prev, [field.id]: e.target.value }))}
                            />
                        )}

                        {field.type === "boolean" && (
                            <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => setScorecardData(prev => ({ ...prev, [field.id]: true }))}
                                  className="px-4 py-2 rounded-lg font-urbanist text-[12px] font-semibold transition-colors"
                                  style={
                                    scorecardData[field.id] === true
                                      ? { backgroundColor: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "rgba(34,197,94,0.8)" }
                                      : { backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }
                                  }
                                >
                                    Yes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setScorecardData(prev => ({ ...prev, [field.id]: false }))}
                                  className="px-4 py-2 rounded-lg font-urbanist text-[12px] font-semibold transition-colors"
                                  style={
                                    scorecardData[field.id] === false
                                      ? { backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "rgba(239,68,68,0.8)" }
                                      : { backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }
                                  }
                                >
                                    No
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white disabled:opacity-50 transition-colors"
                      style={{ backgroundColor: "var(--lhr-orange)" }}
                    >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? "Saving..." : "Save Scorecard"}
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
}
