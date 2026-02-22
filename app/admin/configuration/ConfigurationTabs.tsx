"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { InterviewSlotConfig } from "@/lib/models/Interview";
import { User, UserRole } from "@/lib/models/User";
import { InterviewsTab } from "./InterviewsTab";
import { ScorecardsTab } from "./ScorecardsTab";
import { QuestionsTab } from "./QuestionsTab";
import { TeamsTab } from "./TeamsTab";
import { AboutTab } from "./AboutTab";
import { Calendar, ClipboardList, FileQuestion, Users, Info } from "lucide-react";

type TabType = "interviews" | "scorecards" | "questions" | "teams" | "about";

interface ConfigurationTabsProps {
  configs: InterviewSlotConfig[];
  calendars: { id: string; summary: string }[];
  teamMembersMap: Record<string, User[]>;
  showCreateButton: boolean;
  leadSystemMissing: boolean;
  userData: User;
}

export function ConfigurationTabs({
  configs,
  calendars,
  teamMembersMap,
  showCreateButton,
  leadSystemMissing,
  userData,
}: ConfigurationTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState<TabType>(
    tabParam === "scorecards" ? "scorecards" : tabParam === "questions" ? "questions" : tabParam === "teams" ? "teams" : tabParam === "about" && userData.role === UserRole.ADMIN ? "about" : "interviews"
  );

  const isAdmin = userData.role === UserRole.ADMIN;

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    router.push(`/admin/configuration?tab=${tab}`, { scroll: false });
  };

  const baseTabs = [
    { id: "interviews" as TabType, label: "Interviews", icon: Calendar },
    { id: "scorecards" as TabType, label: "Scorecards", icon: ClipboardList },
    { id: "questions" as TabType, label: "Questions", icon: FileQuestion },
    { id: "teams" as TabType, label: "Teams", icon: Users },
  ];

  // Only show About tab to admins
  const tabs = isAdmin
    ? [...baseTabs, { id: "about" as TabType, label: "About", icon: Info }]
    : baseTabs;

  return (
    <div
      className="min-h-[calc(100vh-64px)] relative"
      style={{ background: "#030608" }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 50% 0%, rgba(4,95,133,0.06) 0%, transparent 100%)",
        }}
      />

      <div className="relative max-w-[1400px] mx-auto px-6 md:px-10 py-8">
        {/* Page Header */}
        <div
          className="mb-8 animate-fadeSlideUp"
          style={{ animationDelay: "0.05s", animationFillMode: "both" }}
        >
          <p
            className="text-[11px] font-semibold tracking-widest uppercase mb-2"
            style={{ color: "var(--lhr-gray-blue)" }}
          >
            System Configuration
          </p>
          <h1 className="font-montserrat text-[28px] font-bold tracking-tight text-white mb-1">
            Configuration
          </h1>
          <p className="font-urbanist text-[14px] text-white/35">
            Manage interview, scorecard, and application question settings for your teams.
          </p>
        </div>

        {/* Tab Navigation */}
        <div
          className="flex gap-1 mb-8 pb-px animate-fadeSlideUp"
          style={{
            animationDelay: "0.1s",
            animationFillMode: "both",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className="flex items-center gap-2 px-4 py-3 text-[13px] font-medium tracking-wide transition-colors duration-200 -mb-px"
                style={{
                  color: isActive ? "var(--lhr-gold)" : "rgba(255,255,255,0.35)",
                  borderBottom: isActive
                    ? "2px solid var(--lhr-gold)"
                    : "2px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = "rgba(255,255,255,0.6)";
                    e.currentTarget.style.borderBottomColor = "rgba(255,255,255,0.15)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = "rgba(255,255,255,0.35)";
                    e.currentTarget.style.borderBottomColor = "transparent";
                  }
                }}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div
          className="animate-fadeSlideUp"
          style={{ animationDelay: "0.15s", animationFillMode: "both" }}
        >
          {activeTab === "interviews" && (
            <InterviewsTab
              configs={configs}
              calendars={calendars}
              teamMembersMap={teamMembersMap}
              showCreateButton={showCreateButton}
              leadSystemMissing={leadSystemMissing}
              userData={userData}
            />
          )}

          {activeTab === "scorecards" && <ScorecardsTab />}

          {activeTab === "questions" && <QuestionsTab userData={userData} />}

          {activeTab === "teams" && <TeamsTab userData={userData} />}

          {activeTab === "about" && isAdmin && <AboutTab />}
        </div>
      </div>
    </div>
  );
}
