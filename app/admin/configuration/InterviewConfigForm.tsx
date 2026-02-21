"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { InterviewSlotConfig } from "@/lib/models/Interview";
import { User } from "@/lib/models/User";
import { updateInterviewConfig } from "@/lib/actions/interview-config";
import { Calendar, Save, Loader2, Clock, Users, Globe, X, Search, UserPlus } from "lucide-react";
import { toast } from "react-hot-toast";

interface Props {
  config: InterviewSlotConfig;
  calendars: { id: string; summary: string }[];
  availableUsers: User[];
}

const selectStyle = {
  backgroundColor: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const optionStyle = { backgroundColor: "#0c1218", color: "white" };

export function InterviewConfigForm({ config, calendars, availableUsers }: Props) {
  const [formData, setFormData] = useState<InterviewSlotConfig>(config);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredUsers = useMemo(() => {
    const notSelected = availableUsers.filter(
      (user) => !formData.interviewerEmails.includes(user.email)
    );

    const filtered = searchQuery
      ? notSelected.filter((user) =>
          user.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : notSelected;

    return filtered.sort((a, b) => {
      const aInSystem = a.memberProfile?.system === config.system;
      const bInSystem = b.memberProfile?.system === config.system;
      if (aInSystem && !bInSystem) return -1;
      if (!aInSystem && bInSystem) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [availableUsers, formData.interviewerEmails, searchQuery, config.system]);

  const selectedUsers = useMemo(() => {
    return availableUsers.filter((user) =>
      formData.interviewerEmails.includes(user.email)
    );
  }, [availableUsers, formData.interviewerEmails]);

  const handleChange = (field: keyof InterviewSlotConfig, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateInterviewConfig(formData);
      toast.success("Configuration saved successfully");
      setHasChanges(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const daysOfWeek = [
    { value: 0, label: "Sunday" },
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header */}
      <div
        className="p-5 flex justify-between items-center"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-1.5 h-8 rounded-full"
            style={{ backgroundColor: "var(--lhr-gold)" }}
          />
          <div>
            <h2 className="font-montserrat text-[17px] font-bold text-white">
              {config.team} — {config.system}
            </h2>
            <p className="font-urbanist text-[12px] text-white/25 mt-0.5">
              ID: {config.id}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200"
          style={{
            backgroundColor: hasChanges ? "var(--lhr-blue)" : "rgba(255,255,255,0.03)",
            color: hasChanges ? "white" : "rgba(255,255,255,0.2)",
            border: hasChanges ? "none" : "1px solid rgba(255,255,255,0.06)",
            cursor: hasChanges ? "pointer" : "not-allowed",
          }}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column */}
        <div className="space-y-6">
          <h3 className="text-[13px] font-semibold tracking-wide text-white/60 flex items-center gap-2">
            <Calendar className="h-4 w-4" style={{ color: "var(--lhr-blue)" }} />
            Scheduling Details
          </h3>

          <div className="space-y-4">
            <div>
              <label
                className="block text-[11px] font-semibold tracking-widest uppercase mb-2"
                style={{ color: "var(--lhr-gray-blue)" }}
              >
                Google Calendar
              </label>
              <select
                value={formData.calendarId}
                onChange={(e) => handleChange("calendarId", e.target.value)}
                className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white appearance-none focus:outline-none transition-colors"
                style={selectStyle}
              >
                <option value="" style={optionStyle}>Select a calendar...</option>
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id} style={optionStyle}>
                    {cal.summary}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-[11px] font-semibold tracking-widest uppercase mb-2"
                  style={{ color: "var(--lhr-gray-blue)" }}
                >
                  Duration (min)
                </label>
                <input
                  type="number"
                  value={formData.durationMinutes}
                  onChange={(e) => handleChange("durationMinutes", parseInt(e.target.value))}
                  className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white focus:outline-none transition-colors"
                  style={selectStyle}
                />
              </div>
              <div>
                <label
                  className="block text-[11px] font-semibold tracking-widest uppercase mb-2"
                  style={{ color: "var(--lhr-gray-blue)" }}
                >
                  Buffer (min)
                </label>
                <input
                  type="number"
                  value={formData.bufferMinutes}
                  onChange={(e) => handleChange("bufferMinutes", parseInt(e.target.value))}
                  className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white focus:outline-none transition-colors"
                  style={selectStyle}
                />
              </div>
            </div>

            <div>
              <label
                className="block text-[11px] font-semibold tracking-widest uppercase mb-2 flex items-center gap-1.5"
                style={{ color: "var(--lhr-gray-blue)" }}
              >
                <Globe className="h-3.5 w-3.5" /> Timezone
              </label>
              <div
                className="w-full h-10 rounded-lg px-3 flex items-center text-[13px] font-urbanist text-white/30"
                style={selectStyle}
              >
                America/Chicago (CST)
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <h3 className="text-[13px] font-semibold tracking-wide text-white/60 flex items-center gap-2">
            <Clock className="h-4 w-4" style={{ color: "var(--lhr-blue)" }} />
            Availability Window
          </h3>

          <div className="space-y-4">
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <label
                  className="block text-[11px] font-semibold tracking-widest uppercase mb-2"
                  style={{ color: "var(--lhr-gray-blue)" }}
                >
                  Start Hour (0-23)
                </label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={formData.availableStartHour}
                  onChange={(e) => handleChange("availableStartHour", parseInt(e.target.value))}
                  className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white focus:outline-none transition-colors"
                  style={selectStyle}
                />
              </div>
              <div className="flex-1">
                <label
                  className="block text-[11px] font-semibold tracking-widest uppercase mb-2"
                  style={{ color: "var(--lhr-gray-blue)" }}
                >
                  End Hour (0-23)
                </label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={formData.availableEndHour}
                  onChange={(e) => handleChange("availableEndHour", parseInt(e.target.value))}
                  className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white focus:outline-none transition-colors"
                  style={selectStyle}
                />
              </div>
            </div>

            <div>
              <label
                className="block text-[11px] font-semibold tracking-widest uppercase mb-2"
                style={{ color: "var(--lhr-gray-blue)" }}
              >
                Available Days
              </label>
              <div className="flex flex-wrap gap-2">
                {daysOfWeek.map((day) => {
                  const isSelected = formData.availableDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      onClick={() => {
                        const newDays = isSelected
                          ? formData.availableDays.filter((d) => d !== day.value)
                          : [...formData.availableDays, day.value];
                        handleChange("availableDays", newDays);
                      }}
                      className="px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors duration-200"
                      style={{
                        backgroundColor: isSelected ? "rgba(4,95,133,0.15)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${isSelected ? "rgba(4,95,133,0.30)" : "rgba(255,255,255,0.06)"}`,
                        color: isSelected ? "var(--lhr-blue-light)" : "rgba(255,255,255,0.3)",
                      }}
                    >
                      {day.label.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1rem" }}>
              <h3 className="text-[13px] font-semibold tracking-wide text-white/60 flex items-center gap-2 mb-4">
                <Users className="h-4 w-4" style={{ color: "var(--lhr-blue)" }} />
                Interviewers
              </h3>

              {/* Searchable Dropdown */}
              <div className="relative mb-4" ref={dropdownRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder="Search team members by name..."
                    className="w-full h-10 rounded-lg pl-9 pr-4 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none transition-colors"
                    style={selectStyle}
                  />
                </div>

                {dropdownOpen && (
                  <div
                    className="absolute z-10 w-full mt-2 rounded-lg max-h-48 overflow-y-auto"
                    style={{
                      backgroundColor: "#0c1218",
                      border: "1px solid rgba(255,255,255,0.08)",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                    }}
                  >
                    {filteredUsers.length === 0 ? (
                      <div className="p-3 text-[13px] font-urbanist text-white/25 text-center">
                        {searchQuery ? "No members found" : "All team members are selected"}
                      </div>
                    ) : (
                      filteredUsers.map((user) => {
                        const isSystemMember = user.memberProfile?.system === config.system;
                        return (
                          <div
                            key={user.uid}
                            onClick={() => {
                              const newEmails = [...formData.interviewerEmails, user.email];
                              handleChange("interviewerEmails", newEmails);
                              setSearchQuery("");
                            }}
                            className="flex items-center justify-between p-3 cursor-pointer transition-colors duration-150"
                            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <UserPlus className="h-4 w-4 text-white/20" />
                              <div>
                                <div className="text-[13px] font-medium text-white/80">{user.name}</div>
                                <div className="text-[11px] text-white/25">{user.email}</div>
                              </div>
                            </div>
                            {isSystemMember && (
                              <span
                                className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded"
                                style={{
                                  backgroundColor: "rgba(4,95,133,0.12)",
                                  color: "var(--lhr-blue-light)",
                                  border: "1px solid rgba(4,95,133,0.20)",
                                }}
                              >
                                {config.system}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Selected Interviewers */}
              <div className="space-y-2">
                {selectedUsers.length === 0 ? (
                  <div
                    className="p-3 rounded-lg text-[13px] font-urbanist text-white/25 text-center"
                    style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                  >
                    No interviewers selected
                  </div>
                ) : (
                  selectedUsers.map((user) => {
                    const isSystemMember = user.memberProfile?.system === config.system;
                    return (
                      <div
                        key={user.uid}
                        className="flex items-center justify-between p-3 rounded-lg"
                        style={{
                          backgroundColor: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-semibold"
                            style={{
                              backgroundColor: "rgba(4,95,133,0.12)",
                              color: "var(--lhr-blue-light)",
                            }}
                          >
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-[13px] font-medium text-white/80 flex items-center gap-2">
                              {user.name}
                              {isSystemMember && (
                                <span
                                  className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded"
                                  style={{
                                    backgroundColor: "rgba(4,95,133,0.12)",
                                    color: "var(--lhr-blue-light)",
                                    border: "1px solid rgba(4,95,133,0.20)",
                                  }}
                                >
                                  {config.system}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-white/25">{user.email}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const newEmails = formData.interviewerEmails.filter(
                              (e) => e !== user.email
                            );
                            handleChange("interviewerEmails", newEmails);
                          }}
                          className="p-1.5 rounded-lg transition-colors duration-150"
                          style={{ color: "rgba(255,255,255,0.2)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.10)";
                            e.currentTarget.style.color = "#ef4444";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                            e.currentTarget.style.color = "rgba(255,255,255,0.2)";
                          }}
                          title="Remove interviewer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
              <p className="font-urbanist text-[11px] text-white/20 mt-2">
                Select users who will receive calendar invites for interviews.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
