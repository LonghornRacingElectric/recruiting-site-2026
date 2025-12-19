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
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

interface Props {
  existingConfigs: InterviewSlotConfig[];
  userRole: UserRole;
  userTeam?: Team;
}

export function CreateConfigModal({ existingConfigs, userRole, userTeam }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | "">("");
  const [selectedSystem, setSelectedSystem] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);

  // Determine available teams based on role
  const availableTeams = userRole === UserRole.ADMIN
    ? Object.values(Team)
    : (userTeam ? [userTeam] : []);

  // Determine available systems based on selected team
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

    // Check if exists
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
        id: "", // Will be generated
        team: selectedTeam as Team,
        system: selectedSystem,
        calendarId: "",
        interviewerEmails: [],
        durationMinutes: 30,
        bufferMinutes: 10,
        availableDays: [1, 2, 3, 4, 5], // Mon-Fri
        availableStartHour: 9,
        availableEndHour: 17,
        timezone: "America/Chicago"
      };

      await createInterviewConfig(newConfig);
      toast.success("Configuration created successfully!");
      setIsOpen(false);
      // We need to refresh the page to see the new config.
      // In Next.js App Router with Server Actions, this usually happens automatically if we use revalidatePath,
      // but since we don't have that easily accessible here, we might need a manual reload or router.refresh()
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
        className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
      >
        <Plus className="h-4 w-4" />
        Create Configuration
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-white/10 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Create Configuration</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-neutral-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Team</label>
            <select
              value={selectedTeam}
              onChange={(e) => {
                setSelectedTeam(e.target.value as Team);
                setSelectedSystem("");
              }}
              className="w-full bg-neutral-950 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="">Select Team...</option>
              {availableTeams.map(team => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">System</label>
            <select
              value={selectedSystem}
              onChange={(e) => setSelectedSystem(e.target.value)}
              disabled={!selectedTeam}
              className="w-full bg-neutral-950 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select System...</option>
              {systems.map(sys => (
                <option key={sys} value={sys}>{sys}</option>
              ))}
            </select>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!selectedTeam || !selectedSystem || isCreating}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
