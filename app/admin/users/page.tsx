"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { User, UserRole, Team, ElectricSystem, SolarSystem, CombustionSystem } from "@/lib/models/User";
import { Loader2, Search, Edit2 } from "lucide-react";
import Link from "next/link";

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
    
    // Filter out applicants if toggle is on
    if (hideApplicants) {
      result = result.filter(u => u.role !== UserRole.APPLICANT);
    }
    
    // Apply search filter
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
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  role: editForm.role,
                  team: editForm.team || null,
                  system: editForm.system || null,
              })
          });

          if (res.ok) {
              // Update local state
              const updatedUsers = users.map(u => {
                  if (u.uid === editingUser.uid) {
                      return {
                          ...u,
                          role: editForm.role,
                          memberProfile: editForm.team ? {
                              team: editForm.team as Team,
                              system: editForm.system as any
                          } : undefined,
                          isMember: !!editForm.team 
                      };
                  }
                  return u;
              });
              setUsers(updatedUsers);
              setEditingUser(null);
          } else {
              toast.error('Failed to update user');
          }
      } catch (error) {
          console.error(error);
          toast.error('Error updating user');
      } finally {
          setIsSaving(false);
      }
  }

  const getSystemOptions = (team: Team | "") => {
      switch (team) {
          case Team.ELECTRIC: return Object.values(ElectricSystem);
          case Team.SOLAR: return Object.values(SolarSystem);
          case Team.COMBUSTION: return Object.values(CombustionSystem);
          default: return [];
      }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hideApplicants}
              onChange={(e) => setHideApplicants(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-neutral-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-0"
            />
            <span className="text-sm text-neutral-400">Hide applicants</span>
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-64 rounded-md bg-neutral-900 border border-white/10 pl-9 pr-4 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>
      </div>

      <div className="border border-white/10 rounded-lg overflow-hidden bg-neutral-900/50">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="p-4 font-medium text-neutral-300">Name</th>
              <th className="p-4 font-medium text-neutral-300">Email</th>
              <th className="p-4 font-medium text-neutral-300">Role</th>
              <th className="p-4 font-medium text-neutral-300">Team</th>
              <th className="p-4 font-medium text-neutral-300">System</th>
              <th className="p-4 font-medium text-neutral-300 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredUsers.map((user) => (
              <tr key={user.uid} className="hover:bg-white/5 transition-colors">
                <td className="p-4 font-medium text-white">{user.name}</td>
                <td className="p-4 text-neutral-400">{user.email}</td>
                <td className="p-4">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                      user.role === UserRole.ADMIN
                        ? "bg-red-500/10 text-red-500 border-red-500/20"
                        : user.role === UserRole.TEAM_CAPTAIN_OB
                        ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                        : "bg-neutral-800 text-neutral-400 border-white/10"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="p-4 text-neutral-300">
                    {user.memberProfile?.team || "-"}
                </td>
                <td className="p-4 text-neutral-300">
                    {user.memberProfile?.system || "-"}
                </td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => handleEditClick(user)}
                    className="p-1.5 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-lg shadow-xl p-6 space-y-4">
            <h2 className="text-xl font-bold">Edit User</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Name</label>
                    <div className="text-white">{editingUser.name}</div>
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Role</label>
                    <select 
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                        className="w-full h-10 rounded-md bg-black border border-white/10 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                    >
                        {Object.values(UserRole).map(role => (
                            <option key={role} value={role}>{role}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Team</label>
                    <select 
                        value={editForm.team}
                        onChange={(e) => setEditForm({ ...editForm, team: e.target.value as Team, system: "" })}
                        className="w-full h-10 rounded-md bg-black border border-white/10 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                    >
                        <option value="">None</option>
                        {Object.values(Team).map(team => (
                            <option key={team} value={team}>{team}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">System</label>
                    <select 
                        value={editForm.system}
                        disabled={!editForm.team}
                        onChange={(e) => setEditForm({ ...editForm, system: e.target.value })}
                        className="w-full h-10 rounded-md bg-black border border-white/10 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50"
                    >
                        <option value="">None</option>
                        {getSystemOptions(editForm.team).map(system => (
                             <option key={system} value={system}>{system}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
                <button 
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 rounded-md bg-neutral-800 text-sm font-medium hover:bg-neutral-700 transition-colors"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-md bg-orange-500 text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                    {isSaving ? "Saving..." : "Save Changes"}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
