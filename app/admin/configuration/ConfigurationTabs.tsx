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
import { EmailTab } from "./EmailTab";
import { FaqTab } from "./FaqTab";
import { ContactTab } from "./ContactTab";
import { Calendar, ClipboardList, FileQuestion, Users, Info, Mail, HelpCircle, AtSign } from "lucide-react";
import clsx from "clsx";

type TabType = "interviews" | "scorecards" | "questions" | "teams" | "about" | "emails" | "faq" | "contact";

interface ConfigurationTabsProps {
  configs: InterviewSlotConfig[];
  showCreateButton: boolean;
  leadSystemMissing: boolean;
  userData: User;
}

export function ConfigurationTabs({
  configs,
  showCreateButton,
  leadSystemMissing,
  userData,
}: ConfigurationTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState<TabType>(
    tabParam === "scorecards" ? "scorecards" : tabParam === "questions" ? "questions" : tabParam === "teams" ? "teams" : tabParam === "about" && userData.role === UserRole.ADMIN ? "about" : tabParam === "emails" && userData.role === UserRole.ADMIN ? "emails" : tabParam === "faq" && userData.role === UserRole.ADMIN ? "faq" : tabParam === "contact" && userData.role === UserRole.ADMIN ? "contact" : "interviews"
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

  // Only show About and Emails tab to admins
  const tabs = isAdmin
    ? [...baseTabs, { id: "about" as TabType, label: "About", icon: Info }, { id: "emails" as TabType, label: "Emails", icon: Mail }, { id: "faq" as TabType, label: "FAQ", icon: HelpCircle }, { id: "contact" as TabType, label: "Contact", icon: AtSign }]
    : baseTabs;

  return (
    <div
      className="min-h-[calc(100vh-64px)] relative mt-16"
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

        {/* Tab Navigation — scrolls horizontally on narrow viewports so the
            row never pushes the page wider than the viewport. */}
        <div
          className="mb-8 animate-fadeSlideUp border-b border-white/10"
          style={{
            animationDelay: "0.1s",
            animationFillMode: "both",
          }}
        >
          <div
            className="flex gap-1 pb-px overflow-x-auto scrollbar-hide flex-nowrap"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  // Classes, not inline rgba: the light theme remaps `text-white/*`
                  // classes but cannot see inline colours, which left inactive
                  // tabs white-on-white until a hover repainted them. Hover is an
                  // opacity change because the light remap is !important and would
                  // otherwise swallow a hover colour.
                  className={clsx(
                    "flex items-center gap-2 px-4 py-3 text-[13px] font-medium tracking-wide transition-colors duration-200 -mb-px shrink-0 whitespace-nowrap border-b-2",
                    isActive
                      ? "border-[var(--lhr-gold)] text-[var(--lhr-gold)]"
                      : "border-transparent text-white/60 opacity-60 hover:opacity-100 hover:border-current"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div
          className="animate-fadeSlideUp overflow-visible"
          style={{ animationDelay: "0.15s", animationFillMode: "both" }}
        >
          {activeTab === "interviews" && (
            <InterviewsTab
              configs={configs}
              showCreateButton={showCreateButton}
              leadSystemMissing={leadSystemMissing}
              userData={userData}
            />
          )}

          {activeTab === "scorecards" && <ScorecardsTab />}

          {activeTab === "questions" && <QuestionsTab userData={userData} />}

          {activeTab === "teams" && <TeamsTab userData={userData} />}

          {activeTab === "about" && isAdmin && <AboutTab />}

          {activeTab === "emails" && isAdmin && <EmailTab />}

          {activeTab === "faq" && isAdmin && <FaqTab />}

          {activeTab === "contact" && isAdmin && <ContactTab />}
        </div>
      </div>
    </div>
  );
}
