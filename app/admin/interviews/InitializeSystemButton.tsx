"use client";

import { useState } from "react";
import { Team } from "@/lib/models/User";
import { createInterviewConfig } from "@/lib/actions/interview-config";
import { InterviewSlotConfig } from "@/lib/models/Interview";
import { Loader2, Zap } from "lucide-react";
import { toast } from "react-hot-toast";

interface Props {
  team: Team;
  system: string;
}

export function InitializeSystemButton({ team, system }: Props) {
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const newConfig: InterviewSlotConfig = {
        id: "", // generated on server
        team,
        system,
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
      toast.success("System initialized successfully!");
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast.error("Failed to initialize system.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <button
      onClick={handleCreate}
      disabled={isCreating}
      className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
      Initialize Now
    </button>
  );
}
