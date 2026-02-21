"use client";

import { useState } from "react";
import {
  Team,
  ElectricSystem,
  SolarSystem,
  CombustionSystem,
  UserRole
} from "@/lib/models/User";
import { createInterviewConfig } from "@/lib/actions/interview-config";
import { InterviewSlotConfig } from "@/lib/models/Interview";
import { Plus, X, Loader2, ChevronDown } from "lucide-react";
import { toast } from "react-hot-toast";

interface Props {
  existingConfigs: InterviewSlotConfig[];
  userRole: UserRole;
  userTeam?: Team;
}

const optionStyle = { backgroundColor: "#0c1218", color: "white" };

export function CreateConfigModal({ existingConfigs, userRole, userTeam }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | "">("");
  const [selectedSystem, setSelectedSystem] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);

  const availableTeams = userRole === UserRole.ADMIN
    ? Object.values(Team)
    : (userTeam ? [userTeam] : []);

  const getSystems = (team: Team | "") => {
    switch (team) {
      case Team.ELECTRIC: return Object.values(ElectricSystem);
      case Team.SOLAR: return Object.values(SolarSystem);
      case Team.COMBUSTION: return Object.values(CombustionSystem);
      default: return [];
    }
  };

  const systems = getSystems(selectedTeam);

  const handleCreate = async () => {
    if (!selectedTeam || !selectedSystem) return;

    const exists = existingConfigs.some(
      c => c.team === selectedTeam && c.system === selectedSystem
    );

    if (exists) {
      toast.error("Configuration for this system already exists.");
      return;
    }

    setIsCreating(true);
    try {
      const newConfig: InterviewSlotConfig = {
        id: "",
        team: selectedTeam as Team,
        system: selectedSystem,
        calendarId: "",
        interviewerEmails: [],
        durationMinutes: 30,
        bufferMinutes: 10,
        availableDays: [1, 2, 3, 4, 5],
        availableStartHour: 9,
        availableEndHour: 17,
        timezone: "America/Chicago"
      };

      await createInterviewConfig(newConfig);
      toast.success("Configuration created successfully!");
      setIsOpen(false);
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast.error("Failed to create configuration.");
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors duration-200"
        style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#056fa0"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--lhr-blue)"; }}
      >
        <Plus className="h-4 w-4" />
        Create Configuration
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.60)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-md rounded-xl overflow-hidden animate-fadeSlideUp"
        style={{
          backgroundColor: "rgba(8,14,20,0.97)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Stripe */}
        <div className="flex items-center gap-0.5 px-6 pt-5">
          <div className="h-[3px] w-5 rounded-full" style={{ backgroundColor: "var(--lhr-gold-light)" }} />
          <div className="h-[3px] w-5 rounded-full" style={{ backgroundColor: "var(--lhr-gold)" }} />
          <div className="h-[3px] w-5 rounded-full" style={{ backgroundColor: "var(--lhr-orange)" }} />
        </div>

        <div className="px-6 pt-4 pb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: "var(--lhr-gray-blue)" }}>
                New Configuration
              </p>
              <h2 className="font-montserrat text-[18px] font-bold text-white">
                Create Interview Config
              </h2>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.03)" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--lhr-gray-blue)" }}>
                Team
              </label>
              <div className="relative">
                <select
                  value={selectedTeam}
                  onChange={(e) => { setSelectedTeam(e.target.value as Team); setSelectedSystem(""); }}
                  className="w-full h-10 rounded-lg px-3 pr-9 text-[13px] font-urbanist text-white appearance-none focus:outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <option value="" style={optionStyle}>Select Team...</option>
                  {availableTeams.map(team => (
                    <option key={team} value={team} style={optionStyle}>{team}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-white/20" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--lhr-gray-blue)" }}>
                System
              </label>
              <div className="relative">
                <select
                  value={selectedSystem}
                  onChange={(e) => setSelectedSystem(e.target.value)}
                  disabled={!selectedTeam}
                  className="w-full h-10 rounded-lg px-3 pr-9 text-[13px] font-urbanist text-white appearance-none focus:outline-none disabled:opacity-30"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <option value="" style={optionStyle}>Select System...</option>
                  {systems.map(sys => (
                    <option key={sys} value={sys} style={optionStyle}>{sys}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-white/20" />
              </div>
            </div>
          </div>

          <div
            className="flex items-center justify-end gap-2 pt-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
          >
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
              style={{ color: "rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!selectedTeam || !selectedSystem || isCreating}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-50"
              style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
            >
              {isCreating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating...
                </span>
              ) : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
