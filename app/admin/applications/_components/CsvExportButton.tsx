"use client";

import { useState, useRef, useEffect } from "react";
import { Download, Loader2, ChevronDown } from "lucide-react";
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

  const role = currentUser?.role;
  const userTeam = currentUser?.memberProfile?.team;
  const userSystem = currentUser?.memberProfile?.system;

  // Close panel on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
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
  const systemsForPanel: string[] = effectiveTeams.flatMap(
    (t) => TEAM_SYSTEMS[t as Team]?.map((s) => s.value) || []
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
        const error = await res.json().catch(() => ({ error: "Export failed" }));
        console.error("CSV export failed:", error);
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
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err) {
      console.error("CSV export error:", err);
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
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-white/10 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        Export CSV
      </button>
    );
  }

  // Team Captain / Admin: button with dropdown panel
  if (role !== UserRole.ADMIN && role !== UserRole.TEAM_CAPTAIN_OB) {
    return null;
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        disabled={loading}
        title="Download CSV export"
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-white/10 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        Export CSV
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-lg border border-white/10 bg-neutral-900 shadow-xl p-3 space-y-3">
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
            <div className="text-[10px] text-neutral-600 mb-2">
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
        </div>
      )}
    </div>
  );
}
