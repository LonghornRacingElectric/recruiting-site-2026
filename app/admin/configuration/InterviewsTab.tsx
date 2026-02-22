"use client";

import { InterviewSlotConfig } from "@/lib/models/Interview";
import { User, UserRole } from "@/lib/models/User";
import { InterviewConfigForm } from "./InterviewConfigForm";
import { CreateConfigModal } from "./CreateConfigModal";
import { InitializeSystemButton } from "./InitializeSystemButton";
import { AlertTriangle, Clock } from "lucide-react";

interface InterviewsTabProps {
  configs: InterviewSlotConfig[];
  calendars: { id: string; summary: string }[];
  teamMembersMap: Record<string, User[]>;
  showCreateButton: boolean;
  leadSystemMissing: boolean;
  userData: User;
}

export function InterviewsTab({
  configs,
  calendars,
  teamMembersMap,
  showCreateButton,
  leadSystemMissing,
  userData,
}: InterviewsTabProps) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-montserrat text-[22px] font-bold text-white mb-1.5">
            Interview Configuration
          </h2>
          <p className="font-urbanist text-[14px] text-white/35">
            Manage interview settings, interviewers, and availability.
          </p>
          <div
            className="inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-md text-[11px] font-medium"
            style={{
              backgroundColor: "rgba(255,181,38,0.06)",
              border: "1px solid rgba(255,181,38,0.12)",
              color: "rgba(255,181,38,0.6)",
            }}
          >
            <Clock className="h-3 w-3" />
            Changes may take up to 1 minute to appear due to caching.
          </div>
        </div>

        {showCreateButton && (
          <CreateConfigModal
            existingConfigs={configs}
            userRole={userData.role}
            userTeam={userData.memberProfile?.team}
          />
        )}
      </div>

      {configs.length === 0 && !leadSystemMissing && !showCreateButton && (
        <div
          className="p-5 rounded-xl font-urbanist text-[14px] text-white/35"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          You do not have access to any interview configurations.
        </div>
      )}

      {leadSystemMissing && userData.memberProfile && (
        <div
          className="p-5 rounded-xl flex items-center justify-between"
          style={{
            backgroundColor: "rgba(255,148,4,0.06)",
            border: "1px solid rgba(255,148,4,0.15)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,148,4,0.10)" }}
            >
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--lhr-orange)" }} />
            </div>
            <div>
              <h3 className="font-montserrat text-[15px] font-semibold" style={{ color: "var(--lhr-orange)" }}>
                Configuration Missing
              </h3>
              <p className="font-urbanist text-[13px] text-white/40 mt-0.5">
                The interview configuration for{" "}
                <span className="text-white/70 font-medium">{userData.memberProfile.system}</span>{" "}
                has not been initialized.
              </p>
            </div>
          </div>
          <InitializeSystemButton
            team={userData.memberProfile.team}
            system={userData.memberProfile.system as string}
          />
        </div>
      )}

      <div className="grid gap-8">
        {configs.map((config) => (
          <InterviewConfigForm
            key={config.id}
            config={config}
            calendars={calendars}
            availableUsers={teamMembersMap[config.team] || []}
          />
        ))}
      </div>
    </div>
  );
}
