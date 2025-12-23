"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import clsx from "clsx";
import { ScorecardConfig, ScorecardSubmission } from "@/lib/models/Scorecard";

interface ApplicationScorecardProps {
  applicationId: string;
  currentUserSystem?: string;
  isPrivilegedUser: boolean; // Admin or Captain
  team?: string;
  preferredSystems?: string[];
}

export default function ApplicationScorecard({ 
  applicationId, 
  currentUserSystem,
  isPrivilegedUser,
  team,
  preferredSystems 
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
    // Build query params to avoid re-fetching application data
    const params = new URLSearchParams();
    if (selectedSystem) params.set('system', selectedSystem);
    if (team) params.set('team', team);
    if (preferredSystems?.length) params.set('preferredSystems', preferredSystems.join(','));
    const queryString = params.toString() ? `?${params.toString()}` : '';
    
    fetch(`/api/admin/applications/${applicationId}/scorecard${queryString}`)
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
    return <div className="text-neutral-500">Loading scorecard...</div>;
  }

  if (!loading && !scorecardConfig) {
    return <div className="text-neutral-500">No scorecard configuration found for this team.</div>;
  }

  // Guard against null config if still loading
  if (!scorecardConfig) return null;

  return (
    <div className="max-w-2xl space-y-6">
        {/* System Selector for Privileged Users */}
        {isPrivilegedUser && allTeamSystems.length > 1 && (
            <div className="p-4 rounded-lg bg-neutral-900/50 border border-white/5">
                <label className="block text-sm font-medium text-neutral-400 mb-2">
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
                                className={clsx(
                                    "px-3 py-1.5 text-sm rounded-lg border transition-colors",
                                    isSelected
                                        ? "bg-orange-500/20 border-orange-500 text-orange-400"
                                        : hasConfig
                                            ? "bg-neutral-800 border-white/10 text-white hover:border-white/20"
                                            : "bg-neutral-800/50 border-white/5 text-neutral-500"
                                )}
                            >
                                {sys}
                                {hasConfig && !isSelected && (
                                    <span className="ml-1 text-xs text-green-400">●</span>
                                )}
                            </button>
                        );
                    })}
                </div>
                <p className="text-xs text-neutral-600 mt-2">
                    <span className="text-green-400">●</span> indicates systems with configured scorecards
                </p>
            </div>
        )}
        
        {/* Aggregate Scores Display */}
        {aggregates && aggregates.totalSubmissions > 0 && (
            <div className="p-4 rounded-lg bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold">Aggregate Scores</h3>
                    <span className="text-sm text-neutral-400">
                        {aggregates.totalSubmissions} reviewer{aggregates.totalSubmissions !== 1 ? 's' : ''}
                    </span>
                </div>
                
                {/* Overall Weighted Average */}
                {aggregates.overallWeightedAverage !== undefined && (
                    <div className="mb-4 p-3 bg-neutral-900/50 rounded-lg">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-neutral-400">Overall Weighted Average</span>
                            <span className="text-2xl font-bold text-orange-400">
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
                                    <span className="text-sm text-white">{score.fieldLabel}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-orange-400">
                                            {score.average.toFixed(2)}
                                        </span>
                                        <span className="text-xs text-neutral-500">
                                            / {score.max}
                                        </span>
                                        {score.weight && (
                                            <span className="text-xs text-neutral-600">
                                                (w: {score.weight})
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all"
                                        style={{ width: `${(score.average / score.max) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Individual Reviewer Submissions */}
        {isPrivilegedUser && allSubmissions.length > 0 && (
            <div className="p-4 rounded-lg bg-neutral-900/50 border border-white/5">
                <h3 className="text-white font-bold mb-4">Individual Submissions</h3>
                <div className="space-y-3">
                    {allSubmissions.map((sub) => (
                        <div 
                            key={sub.id} 
                            className="p-3 bg-neutral-800/50 rounded-lg border border-white/5"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-white">{sub.reviewerName}</span>
                                <span className="text-xs text-neutral-500">
                                    {sub.updatedAt ? new Date(sub.updatedAt).toLocaleDateString() : ''}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {scorecardConfig.fields
                                    .filter(f => f.type === "rating")
                                    .map(field => {
                                        const value = sub.data[field.id];
                                        return (
                                            <div 
                                                key={field.id}
                                                className="px-2 py-1 bg-neutral-700/50 rounded text-xs"
                                            >
                                                <span className="text-neutral-400">{field.label}: </span>
                                                <span className="text-white font-medium">
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
                                                className={clsx(
                                                    "px-2 py-1 rounded text-xs",
                                                    value === true ? "bg-green-500/20 text-green-400" :
                                                    value === false ? "bg-red-500/20 text-red-400" :
                                                    "bg-neutral-700/50 text-neutral-400"
                                                )}
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
        <div className="border-t border-white/5 pt-6">
            <h3 className="text-white font-bold mb-4">Your Scorecard</h3>
            <form onSubmit={handleSubmit} className="space-y-6">
                {scorecardConfig.fields.map(field => (
                    <div key={field.id} className="p-4 rounded-lg bg-neutral-900 border border-white/5">
                        <label className="block text-sm font-bold text-white mb-1">
                            {field.label} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        {field.description && <p className="text-xs text-neutral-500 mb-3">{field.description}</p>}
                        
                        {field.type === "rating" && (
                            <div className="flex items-center gap-4">
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
                                        <div className={clsx(
                                            "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all border",
                                            scorecardData[field.id] === val 
                                              ? "bg-orange-500 text-white border-orange-500" 
                                              : "bg-neutral-800 text-neutral-400 border-white/10 group-hover:border-orange-500/50"
                                        )}>
                                            {val}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}

                        {field.type === "text" && (
                            <input 
                              type="text" 
                              className="w-full bg-neutral-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                              value={scorecardData[field.id] || ""}
                              onChange={(e) => setScorecardData(prev => ({ ...prev, [field.id]: e.target.value }))}
                            />
                        )}

                        {field.type === "long_text" && (
                            <textarea 
                              className="w-full bg-neutral-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500 h-24"
                              value={scorecardData[field.id] || ""}
                              onChange={(e) => setScorecardData(prev => ({ ...prev, [field.id]: e.target.value }))}
                            />
                        )}

                        {field.type === "boolean" && (
                            <div className="flex gap-4">
                                <button 
                                  type="button"
                                  onClick={() => setScorecardData(prev => ({ ...prev, [field.id]: true }))}
                                  className={clsx(
                                      "px-4 py-2 rounded text-sm font-medium border transition-colors",
                                      scorecardData[field.id] === true 
                                         ? "bg-green-500/20 border-green-500 text-green-400" 
                                         : "bg-neutral-800 border-white/10 text-neutral-400"
                                  )}
                                >
                                    Yes
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => setScorecardData(prev => ({ ...prev, [field.id]: false }))}
                                  className={clsx(
                                      "px-4 py-2 rounded text-sm font-medium border transition-colors",
                                      scorecardData[field.id] === false
                                         ? "bg-red-500/20 border-red-500 text-red-500" 
                                         : "bg-neutral-800 border-white/10 text-neutral-400"
                                  )}
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
                      className="px-6 py-2 bg-orange-600 text-white rounded font-medium hover:bg-orange-700 transition-colors disabled:opacity-50"
                    >
                        {saving ? "Saving..." : "Save Scorecard"}
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
}
