"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Download, Loader2, ChevronDown } from "lucide-react";
import { toast } from "react-hot-toast";
import { createPortal } from "react-dom";
import { UserRole, Team } from "@/lib/models/User";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";

interface CsvExportButtonProps {
  currentUser: {
    role: UserRole;
    memberProfile?: {
      team?: string;
      system?: string;
    };
  } | null;
}

const ALL_TEAMS = [Team.ELECTRIC, Team.SOLAR, Team.COMBUSTION];

export default function CsvExportButton({ currentUser }: CsvExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 280 });

  const role = currentUser?.role;
  const userTeam = currentUser?.memberProfile?.team;
  const userSystem = currentUser?.memberProfile?.system;

  // Update position based on button rect
  const updatePosition = useCallback(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 280;
      
      // Default to aligning the left edge of the dropdown with the left edge of the button
      let left = rect.left;
      
      // If it would clip on the right, align with the right edge instead
      if (left + dropdownWidth > window.innerWidth - 16) {
        left = Math.max(16, rect.right - dropdownWidth);
      }
      
      // Ensure it doesn't clip on the left
      if (left < 16) {
        left = 16;
      }

      setDropdownPos({
        top: rect.bottom + 8, // mt-2 (8px)
        left: left,
        width: dropdownWidth,
      });
    }
  }, [open]);

  // Handle position on mount/resize
  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [updatePosition]);

  // Close panel on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current && 
        !panelRef.current.contains(target) && 
        buttonRef.current && 
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
      return () => document.removeEventListener("mousedown", handleOutsideClick);
    }
  }, [open]);

  // Derive which teams are shown in the panel (for system lead: none, for captain: own team, for admin: all)
  const teamsForPanel: string[] =
    role === UserRole.ADMIN
      ? ALL_TEAMS
      : role === UserRole.TEAM_CAPTAIN_OB && userTeam
      ? [userTeam]
      : [];

  // Systems available for selected teams (or all if no team selected)
  const effectiveTeams = selectedTeams.length > 0 ? selectedTeams : teamsForPanel;
  const systemsForPanel: string[] = Array.from(
    new Set(
      effectiveTeams.flatMap(
        (t) => TEAM_SYSTEMS[t as Team]?.map((s) => s.value) || []
      )
    )
  );

  // When teams change, clear system selections that no longer apply
  useEffect(() => {
    setSelectedSystems((prev) => prev.filter((s) => systemsForPanel.includes(s)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeams]);

  function toggleTeam(team: string) {
    setSelectedTeams((prev) =>
      prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]
    );
  }

  function toggleSystem(system: string) {
    setSelectedSystems((prev) =>
      prev.includes(system) ? prev.filter((s) => s !== system) : [...prev, system]
    );
  }

  async function handleExport() {
    setLoading(true);
    const exportToast = toast.loading("Preparing CSV export...");
    try {
      // Build the request body based on role
      const body: { teams?: string[]; systems?: string[] } = {};

      if (role === UserRole.ADMIN) {
        if (selectedTeams.length > 0) body.teams = selectedTeams;
        if (selectedSystems.length > 0) body.systems = selectedSystems;
      } else if (role === UserRole.TEAM_CAPTAIN_OB) {
        // Captain's team is enforced server-side; we just pass system filter
        if (selectedSystems.length > 0) body.systems = selectedSystems;
      }
      // System Lead: nothing to pass — server enforces their system

      const res = await fetch("/api/admin/applications/export-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Export failed" }));
        console.error("CSV export failed:", errorData);
        toast.error(errorData.error || "Export failed", { id: exportToast });
        return;
      }

      // Trigger download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      a.download = filenameMatch ? filenameMatch[1] : "applicants_export.csv";
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Export downloaded successfully", { id: exportToast });
      setOpen(false);
    } catch (err) {
      console.error("CSV export error:", err);
      toast.error("An unexpected error occurred", { id: exportToast });
    } finally {
      setLoading(false);
    }
  }

  // System Lead: single button, no panel
  if (role === UserRole.SYSTEM_LEAD) {
    return (
      <button
        onClick={handleExport}
        disabled={loading}
        title="Download CSV for your system"
        className="h-7 px-2.5 rounded-md flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
        style={{ 
          backgroundColor: loading ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", 
          border: "1px solid rgba(255,255,255,0.06)",
          color: loading ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)"
        }}
        onMouseEnter={(e) => { 
          if (!loading) {
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; 
            e.currentTarget.style.color = "rgba(255,255,255,0.8)";
          }
        }}
        onMouseLeave={(e) => { 
          if (!loading) {
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"; 
            e.currentTarget.style.color = "rgba(255,255,255,0.4)";
          }
        }}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        <span className="text-[10px] font-semibold tracking-wider font-urbanist">CSV</span>
      </button>
    );
  }

  // Team Captain / Admin: button with dropdown panel
  if (role !== UserRole.ADMIN && role !== UserRole.TEAM_CAPTAIN_OB) {
    return null;
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        disabled={loading}
        title="Download CSV export"
        className="h-7 px-2 rounded-md flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
        style={{ 
          backgroundColor: open ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", 
          border: "1px solid rgba(255,255,255,0.06)",
          color: open ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)"
        }}
        onMouseEnter={(e) => { 
          if (!loading) {
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; 
            e.currentTarget.style.color = "rgba(255,255,255,0.8)";
          }
        }}
        onMouseLeave={(e) => { 
          if (!loading && !open) {
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"; 
            e.currentTarget.style.color = "rgba(255,255,255,0.4)";
          }
        }}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        <span className="text-[10px] font-semibold tracking-wider font-urbanist">CSV</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div 
          ref={panelRef}
          className="fixed z-[100] rounded-lg border border-white/10 bg-[#0c1218] p-3 space-y-3 shadow-2xl" 
          style={{ 
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            border: "1px solid rgba(255,255,255,0.08)", 
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)" 
          }}
        >
          {/* Team selector (Admin only) */}
          {role === UserRole.ADMIN && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                Teams
              </div>
              <div className="flex flex-wrap gap-1">
                {ALL_TEAMS.map((team) => (
                  <button
                    key={team}
                    onClick={() => toggleTeam(team)}
                    className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${
                      selectedTeams.includes(team)
                        ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
                        : "bg-neutral-800 border-white/10 text-neutral-400 hover:border-white/20"
                    }`}
                  >
                    {team}
                  </button>
                ))}
                {selectedTeams.length > 0 && (
                  <button
                    onClick={() => setSelectedTeams([])}
                    className="px-2 py-0.5 text-xs text-neutral-500 hover:text-white transition-colors"
                  >
                    All
                  </button>
                )}
              </div>
              {selectedTeams.length === 0 && (
                <p className="text-[10px] text-neutral-600 mt-1">All teams selected</p>
              )}
            </div>
          )}

          {/* System selector */}
          {systemsForPanel.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                Systems
              </div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {systemsForPanel.map((system) => (
                  <button
                    key={system}
                    onClick={() => toggleSystem(system)}
                    className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${
                      selectedSystems.includes(system)
                        ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                        : "bg-neutral-800 border-white/10 text-neutral-400 hover:border-white/20"
                    }`}
                  >
                    {system}
                  </button>
                ))}
              </div>
              {selectedSystems.length === 0 && (
                <p className="text-[10px] text-neutral-600 mt-1">All systems selected</p>
              )}
            </div>
          )}

          <div className="border-t border-white/5 pt-2">
            <div className="text-[10px] text-neutral-600 mb-2 truncate">
              {selectedTeams.length === 0 && selectedSystems.length === 0
                ? role === UserRole.ADMIN
                  ? "Exporting all 3 teams"
                  : `Exporting all systems for ${userTeam}`
                : [
                    selectedTeams.length > 0 && `${selectedTeams.join(", ")}`,
                    selectedSystems.length > 0 && `${selectedSystems.length} system(s)`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </div>
            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              {loading ? "Exporting..." : "Download CSV"}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

