"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { User, UserRole, Team, ElectricSystem, SolarSystem, CombustionSystem } from "@/lib/models/User";
import { Loader2, Search, Edit2, Users, Shield, X, ChevronDown } from "lucide-react";

const teamColors: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  Electric: {
    bg: "rgba(4,95,133,0.10)",
    border: "rgba(4,95,133,0.25)",
    text: "var(--lhr-blue-light)",
    dot: "var(--lhr-blue)",
  },
  Solar: {
    bg: "rgba(255,181,38,0.08)",
    border: "rgba(255,181,38,0.20)",
    text: "var(--lhr-gold)",
    dot: "var(--lhr-gold)",
  },
  Combustion: {
    bg: "rgba(255,148,4,0.08)",
    border: "rgba(255,148,4,0.20)",
    text: "var(--lhr-orange)",
    dot: "var(--lhr-orange)",
  },
};

const roleStyles: Record<string, { bg: string; border: string; text: string }> = {
  [UserRole.ADMIN]: {
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.20)",
    text: "#ef4444",
  },
  [UserRole.TEAM_CAPTAIN_OB]: {
    bg: "rgba(255,181,38,0.08)",
    border: "rgba(255,181,38,0.20)",
    text: "var(--lhr-gold)",
  },
  [UserRole.SYSTEM_LEAD]: {
    bg: "rgba(4,95,133,0.10)",
    border: "rgba(4,95,133,0.25)",
    text: "var(--lhr-blue-light)",
  },
  [UserRole.REVIEWER]: {
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.20)",
    text: "#a78bfa",
  },
  [UserRole.APPLICANT]: {
    bg: "rgba(255,255,255,0.03)",
    border: "rgba(255,255,255,0.08)",
    text: "rgba(255,255,255,0.4)",
  },
};

const roleLabels: Record<string, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.TEAM_CAPTAIN_OB]: "Captain / OB",
  [UserRole.SYSTEM_LEAD]: "System Lead",
  [UserRole.REVIEWER]: "Reviewer",
  [UserRole.APPLICANT]: "Applicant",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [hideApplicants, setHideApplicants] = useState(true);

  // Edit State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<{
    role: UserRole;
    team: Team | "";
    system: string;
  }>({ role: UserRole.APPLICANT, team: "", system: "" });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    let result = users;

    if (hideApplicants) {
      result = result.filter((u) => u.role !== UserRole.APPLICANT);
    }

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(lower) ||
          u.email.toLowerCase().includes(lower)
      );
    }

    setFilteredUsers(result);
  }, [searchTerm, users, hideApplicants]);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error("Failed to fetch users", error);
    } finally {
      setLoading(false);
    }
  }

  function handleEditClick(user: User) {
    setEditingUser(user);
    setEditForm({
      role: user.role,
      team: user.memberProfile?.team || "",
      system: user.memberProfile?.system || "",
    });
  }

  async function handleSave() {
    if (!editingUser) return;
    setIsSaving(true);

    try {
      const res = await fetch(`/api/admin/users/${editingUser.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editForm.role,
          team: editForm.team || null,
          system: editForm.system || null,
        }),
      });

      if (res.ok) {
        const updatedUsers = users.map((u) => {
          if (u.uid === editingUser.uid) {
            return {
              ...u,
              role: editForm.role,
              memberProfile: editForm.team
                ? {
                    team: editForm.team as Team,
                    system: editForm.system as ElectricSystem | SolarSystem | CombustionSystem,
                  }
                : undefined,
              isMember: !!editForm.team,
            };
          }
          return u;
        });
        setUsers(updatedUsers);
        setEditingUser(null);
        toast.success("User updated");
      } else {
        toast.error("Failed to update user");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error updating user");
    } finally {
      setIsSaving(false);
    }
  }

  const getSystemOptions = (team: Team | "") => {
    switch (team) {
      case Team.ELECTRIC:
        return Object.values(ElectricSystem);
      case Team.SOLAR:
        return Object.values(SolarSystem);
      case Team.COMBUSTION:
        return Object.values(CombustionSystem);
      default:
        return [];
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-[calc(100vh-64px)] flex items-center justify-center"
        style={{ background: "#030608" }}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2
            className="h-6 w-6 animate-spin"
            style={{ color: "var(--lhr-blue)" }}
          />
          <span className="font-urbanist text-[13px] text-white/30">
            Loading users...
          </span>
        </div>
      </div>
    );
  }

  const memberCount = users.filter((u) => u.role !== UserRole.APPLICANT).length;
  const applicantCount = users.filter((u) => u.role === UserRole.APPLICANT).length;

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

      <div className="relative max-w-[1400px] mx-auto px-6 md:px-10 py-8 space-y-6">
        {/* Header */}
        <div
          className="animate-fadeSlideUp"
          style={{ animationDelay: "0.05s", animationFillMode: "both" }}
        >
          <p
            className="text-[11px] font-semibold tracking-widest uppercase mb-2"
            style={{ color: "var(--lhr-gray-blue)" }}
          >
            User Management
          </p>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <h1 className="font-montserrat text-[28px] font-bold tracking-tight text-white">
                Users
              </h1>
              {/* Stat pills */}
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium"
                  style={{
                    backgroundColor: "rgba(4,95,133,0.10)",
                    border: "1px solid rgba(4,95,133,0.20)",
                    color: "var(--lhr-blue-light)",
                  }}
                >
                  <Users className="h-3 w-3" />
                  {memberCount} members
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.35)",
                  }}
                >
                  {applicantCount} applicants
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              {/* Hide applicants toggle */}
              <button
                onClick={() => setHideApplicants(!hideApplicants)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors duration-200"
                style={{
                  backgroundColor: hideApplicants
                    ? "rgba(4,95,133,0.10)"
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${
                    hideApplicants
                      ? "rgba(4,95,133,0.25)"
                      : "rgba(255,255,255,0.06)"
                  }`,
                  color: hideApplicants
                    ? "var(--lhr-blue-light)"
                    : "rgba(255,255,255,0.35)",
                }}
              >
                <div
                  className="w-7 h-4 rounded-full relative transition-colors duration-200"
                  style={{
                    backgroundColor: hideApplicants
                      ? "var(--lhr-blue)"
                      : "rgba(255,255,255,0.10)",
                  }}
                >
                  <div
                    className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200"
                    style={{
                      left: hideApplicants ? "14px" : "2px",
                    }}
                  />
                </div>
                Hide applicants
              </button>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 w-64 rounded-lg pl-9 pr-4 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none transition-colors duration-200"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(4,95,133,0.4)";
                    e.currentTarget.style.backgroundColor =
                      "rgba(255,255,255,0.04)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor =
                      "rgba(255,255,255,0.06)";
                    e.currentTarget.style.backgroundColor =
                      "rgba(255,255,255,0.03)";
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div
          className="rounded-xl overflow-hidden animate-fadeSlideUp"
          style={{
            animationDelay: "0.12s",
            animationFillMode: "both",
            backgroundColor: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <table className="w-full text-left">
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <th
                  className="px-5 py-3.5 text-[11px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--lhr-gray-blue)" }}
                >
                  Name
                </th>
                <th
                  className="px-5 py-3.5 text-[11px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--lhr-gray-blue)" }}
                >
                  Email
                </th>
                <th
                  className="px-5 py-3.5 text-[11px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--lhr-gray-blue)" }}
                >
                  Role
                </th>
                <th
                  className="px-5 py-3.5 text-[11px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--lhr-gray-blue)" }}
                >
                  Team
                </th>
                <th
                  className="px-5 py-3.5 text-[11px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--lhr-gray-blue)" }}
                >
                  System
                </th>
                <th
                  className="px-5 py-3.5 text-[11px] font-semibold tracking-widest uppercase text-right"
                  style={{ color: "var(--lhr-gray-blue)" }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center font-urbanist text-[14px] text-white/25"
                  >
                    {searchTerm
                      ? "No users match your search."
                      : "No users found."}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, i) => {
                  const role = roleStyles[user.role] || roleStyles[UserRole.APPLICANT];
                  const team = user.memberProfile?.team
                    ? teamColors[user.memberProfile.team]
                    : null;

                  return (
                    <tr
                      key={user.uid}
                      className="group transition-colors duration-150"
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "rgba(255,255,255,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      {/* Name */}
                      <td className="px-5 py-3.5">
                        <span className="font-montserrat text-[14px] font-semibold text-white/90">
                          {user.name}
                        </span>
                      </td>

                      {/* Email */}
                      <td className="px-5 py-3.5">
                        <span className="font-urbanist text-[13px] text-white/35">
                          {user.email}
                        </span>
                      </td>

                      {/* Role Badge */}
                      <td className="px-5 py-3.5">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase"
                          style={{
                            backgroundColor: role.bg,
                            border: `1px solid ${role.border}`,
                            color: role.text,
                          }}
                        >
                          {user.role === UserRole.ADMIN && (
                            <Shield className="h-3 w-3" />
                          )}
                          {roleLabels[user.role] || user.role}
                        </span>
                      </td>

                      {/* Team */}
                      <td className="px-5 py-3.5">
                        {team ? (
                          <span className="inline-flex items-center gap-2 text-[13px] font-medium">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: team.dot }}
                            />
                            <span style={{ color: team.text }}>
                              {user.memberProfile?.team}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[13px] text-white/15 font-urbanist">
                            —
                          </span>
                        )}
                      </td>

                      {/* System */}
                      <td className="px-5 py-3.5">
                        <span className="font-urbanist text-[13px] text-white/40">
                          {user.memberProfile?.system || (
                            <span className="text-white/15">—</span>
                          )}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => handleEditClick(user)}
                          className="p-2 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
                          style={{
                            backgroundColor: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.4)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(4,95,133,0.12)";
                            e.currentTarget.style.borderColor =
                              "rgba(4,95,133,0.25)";
                            e.currentTarget.style.color = "var(--lhr-blue-light)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(255,255,255,0.04)";
                            e.currentTarget.style.borderColor =
                              "rgba(255,255,255,0.06)";
                            e.currentTarget.style.color = "rgba(255,255,255,0.4)";
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Footer count */}
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.04)",
              backgroundColor: "rgba(255,255,255,0.01)",
            }}
          >
            <span className="font-urbanist text-[12px] text-white/25">
              Showing {filteredUsers.length} of {users.length} users
            </span>
          </div>
        </div>
      </div>

      {/* ─── Edit User Modal ─── */}
      {editingUser && (
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
            {/* Modal header stripe */}
            <div className="flex items-center gap-0.5 px-6 pt-5">
              <div
                className="h-[3px] w-5 rounded-full"
                style={{ backgroundColor: "var(--lhr-gold-light)" }}
              />
              <div
                className="h-[3px] w-5 rounded-full"
                style={{ backgroundColor: "var(--lhr-gold)" }}
              />
              <div
                className="h-[3px] w-5 rounded-full"
                style={{ backgroundColor: "var(--lhr-orange)" }}
              />
            </div>

            <div className="px-6 pt-4 pb-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p
                    className="text-[11px] font-semibold tracking-widest uppercase mb-1"
                    style={{ color: "var(--lhr-gray-blue)" }}
                  >
                    Edit User
                  </p>
                  <h2 className="font-montserrat text-[18px] font-bold text-white">
                    {editingUser.name}
                  </h2>
                  <p className="font-urbanist text-[13px] text-white/30 mt-0.5">
                    {editingUser.email}
                  </p>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="p-1.5 rounded-lg transition-colors duration-150"
                  style={{
                    color: "rgba(255,255,255,0.25)",
                    backgroundColor: "rgba(255,255,255,0.03)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255,255,255,0.06)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255,255,255,0.03)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.25)";
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form fields */}
              <div className="space-y-4">
                {/* Role */}
                <div>
                  <label
                    className="block text-[11px] font-semibold tracking-widest uppercase mb-2"
                    style={{ color: "var(--lhr-gray-blue)" }}
                  >
                    Role
                  </label>
                  <div className="relative">
                    <select
                      value={editForm.role}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          role: e.target.value as UserRole,
                        })
                      }
                      className="w-full h-10 rounded-lg px-3 pr-9 text-[13px] font-urbanist text-white appearance-none focus:outline-none transition-colors duration-200"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {Object.values(UserRole).map((role) => (
                        <option key={role} value={role}>
                          {roleLabels[role] || role}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
                      style={{ color: "rgba(255,255,255,0.20)" }}
                    />
                  </div>
                </div>

                {/* Team */}
                <div>
                  <label
                    className="block text-[11px] font-semibold tracking-widest uppercase mb-2"
                    style={{ color: "var(--lhr-gray-blue)" }}
                  >
                    Team
                  </label>
                  <div className="relative">
                    <select
                      value={editForm.team}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          team: e.target.value as Team,
                          system: "",
                        })
                      }
                      className="w-full h-10 rounded-lg px-3 pr-9 text-[13px] font-urbanist text-white appearance-none focus:outline-none transition-colors duration-200"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <option value="">None</option>
                      {Object.values(Team).map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
                      style={{ color: "rgba(255,255,255,0.20)" }}
                    />
                  </div>
                </div>

                {/* System */}
                <div>
                  <label
                    className="block text-[11px] font-semibold tracking-widest uppercase mb-2"
                    style={{ color: "var(--lhr-gray-blue)" }}
                  >
                    System
                  </label>
                  <div className="relative">
                    <select
                      value={editForm.system}
                      disabled={!editForm.team}
                      onChange={(e) =>
                        setEditForm({ ...editForm, system: e.target.value })
                      }
                      className="w-full h-10 rounded-lg px-3 pr-9 text-[13px] font-urbanist text-white appearance-none focus:outline-none transition-colors duration-200 disabled:opacity-30"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <option value="">None</option>
                      {getSystemOptions(editForm.team).map((system) => (
                        <option key={system} value={system}>
                          {system}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
                      style={{ color: "rgba(255,255,255,0.20)" }}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div
                className="flex items-center justify-end gap-2 pt-2"
                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
              >
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors duration-200"
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    backgroundColor: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255,255,255,0.06)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.6)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255,255,255,0.03)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.4)";
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--lhr-blue)",
                    color: "white",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSaving)
                      e.currentTarget.style.backgroundColor = "#056fa0";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--lhr-blue)";
                  }}
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
