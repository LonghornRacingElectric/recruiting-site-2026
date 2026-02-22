"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { format, isPast, isToday, isTomorrow, parseISO, addDays } from "date-fns";
import { ExternalLink, Plus, Trash2, Edit2, Calendar, Link as LinkIcon, Users, Clock, X, Check } from "lucide-react";
import { DashboardConfig, DashboardDeadline, DashboardResource } from "@/lib/models/Config";
import { useUser } from "@/hooks/useUser";
import { UserRole } from "@/lib/models/User";
import clsx from "clsx";

interface PendingCounts {
  pendingReviews: {
    total: number;
    byGroup: Record<string, number>;
  };
  pendingDecisions: {
    total: number;
    byGroup: Record<string, number>;
  };
}

export default function AdminDashboardPage() {
  const { user } = useUser();
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [counts, setCounts] = useState<PendingCounts | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit states
  const [editingDeadline, setEditingDeadline] = useState<DashboardDeadline | null>(null);
  const [editingResource, setEditingResource] = useState<DashboardResource | null>(null);
  const [isAddingDeadline, setIsAddingDeadline] = useState(false);
  const [isAddingResource, setIsAddingResource] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === UserRole.ADMIN;

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/config/dashboard").then((res) => res.json()),
      fetch("/api/admin/dashboard/pending-count").then((res) => res.json()),
    ])
      .then(([configData, countsData]) => {
        if (configData.config) {
          setConfig(configData.config);
        }
        if (countsData.counts) {
          setCounts(countsData.counts);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const saveConfig = async (newConfig: Partial<DashboardConfig>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        setConfig((prev) => prev ? { ...prev, ...newConfig, updatedAt: new Date() } : null);
        toast.success("Saved successfully!");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
      }
    } catch {
      toast.error("Error saving");
    } finally {
      setSaving(false);
    }
  };

  const handleAddDeadline = (deadline: Omit<DashboardDeadline, "id">) => {
    const newDeadline: DashboardDeadline = {
      ...deadline,
      id: crypto.randomUUID(),
    };
    const newDeadlines = [...(config?.deadlines || []), newDeadline];
    saveConfig({ deadlines: newDeadlines });
    setIsAddingDeadline(false);
  };

  const handleUpdateDeadline = (deadline: DashboardDeadline) => {
    const newDeadlines = config?.deadlines.map((d) =>
      d.id === deadline.id ? deadline : d
    ) || [];
    saveConfig({ deadlines: newDeadlines });
    setEditingDeadline(null);
  };

  const handleDeleteDeadline = (id: string) => {
    const newDeadlines = config?.deadlines.filter((d) => d.id !== id) || [];
    saveConfig({ deadlines: newDeadlines });
  };

  const handleAddResource = (resource: Omit<DashboardResource, "id">) => {
    const newResource: DashboardResource = {
      ...resource,
      id: crypto.randomUUID(),
    };
    const newResources = [...(config?.resources || []), newResource];
    saveConfig({ resources: newResources });
    setIsAddingResource(false);
  };

  const handleUpdateResource = (resource: DashboardResource) => {
    const newResources = config?.resources.map((r) =>
      r.id === resource.id ? resource : r
    ) || [];
    saveConfig({ resources: newResources });
    setEditingResource(null);
  };

  const handleDeleteResource = (id: string) => {
    const newResources = config?.resources.filter((r) => r.id !== id) || [];
    saveConfig({ resources: newResources });
  };

  const getDeadlineStatus = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isPast(date) && !isToday(date)) return "past";
    if (isToday(date)) return "today";
    if (isTomorrow(date)) return "tomorrow";
    if (date <= addDays(new Date(), 7)) return "soon";
    return "future";
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-20 flex items-center justify-center" style={{ background: '#030608' }}>
        <svg className="animate-spin h-5 w-5 text-white/20" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: 'radial-gradient(ellipse at 20% 0%, rgba(4,95,133,0.07) 0%, transparent 50%), #030608',
        }}
      />

      <div className="container mx-auto px-6 md:px-10 max-w-6xl">
        {/* Page Header */}
        <div className="mb-10">
          <p
            className="text-xs font-semibold tracking-[0.3em] uppercase mb-3"
            style={{ color: 'var(--lhr-gray-blue)' }}
          >
            Admin
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            Dashboard
          </h1>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Pending Reviews */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,148,4,0.1)' }}
                >
                  <Users className="h-4 w-4" style={{ color: 'var(--lhr-orange)' }} />
                </div>
                <h2 className="text-[14px] font-semibold text-white">Pending Reviews</h2>
              </div>

              <div className="text-4xl font-bold text-white mb-1 tracking-tight">
                {counts?.pendingReviews.total || 0}
              </div>
              <p className="font-urbanist text-[13px] text-white/30 mb-5">
                Applications awaiting initial review
              </p>

              {counts && Object.keys(counts.pendingReviews.byGroup).length > 0 && (
                <div className="space-y-2 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  {Object.entries(counts.pendingReviews.byGroup)
                    .sort((a, b) => b[1] - a[1])
                    .map(([group, count]) => (
                      <div key={group} className="flex justify-between text-[13px]">
                        <span className="font-urbanist text-white/30">{group}</span>
                        <span className="text-white font-medium tabular-nums">{count}</span>
                      </div>
                    ))}
                </div>
              )}

              <a
                href="/admin/applications"
                className="group inline-flex items-center gap-1.5 mt-5 text-[13px] font-medium transition-colors duration-200"
                style={{ color: 'var(--lhr-orange)' }}
              >
                View applications
                <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          </div>

          {/* Pending Decisions */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(4,95,133,0.12)' }}
                >
                  <Clock className="h-4 w-4" style={{ color: 'var(--lhr-blue-light)' }} />
                </div>
                <h2 className="text-[14px] font-semibold text-white">Pending Decisions</h2>
              </div>

              <div className="text-4xl font-bold text-white mb-1 tracking-tight">
                {counts?.pendingDecisions.total || 0}
              </div>
              <p className="font-urbanist text-[13px] text-white/30 mb-5">
                In interview/trial stage awaiting final decision
              </p>

              {counts && Object.keys(counts.pendingDecisions.byGroup).length > 0 && (
                <div className="space-y-2 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  {Object.entries(counts.pendingDecisions.byGroup)
                    .sort((a, b) => b[1] - a[1])
                    .map(([group, count]) => (
                      <div key={group} className="flex justify-between text-[13px]">
                        <span className="font-urbanist text-white/30">{group}</span>
                        <span className="text-white font-medium tabular-nums">{count}</span>
                      </div>
                    ))}
                </div>
              )}

              <a
                href="/admin/applications"
                className="group inline-flex items-center gap-1.5 mt-5 text-[13px] font-medium transition-colors duration-200"
                style={{ color: 'var(--lhr-blue-light)' }}
              >
                View applications
                <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Deadlines and Resources Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Deadlines Section */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
                  >
                    <Calendar className="h-4 w-4" style={{ color: '#f87171' }} />
                  </div>
                  <h2 className="text-[14px] font-semibold text-white">Deadlines</h2>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => setIsAddingDeadline(true)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 transition-colors duration-200"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>

              {isAddingDeadline && (
                <DeadlineForm
                  onSave={handleAddDeadline}
                  onCancel={() => setIsAddingDeadline(false)}
                  saving={saving}
                />
              )}

              <div className="space-y-2">
                {(config?.deadlines || [])
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map((deadline) => (
                    <div key={deadline.id}>
                      {editingDeadline?.id === deadline.id ? (
                        <DeadlineForm
                          deadline={editingDeadline}
                          onSave={(d) => handleUpdateDeadline(d as DashboardDeadline)}
                          onCancel={() => setEditingDeadline(null)}
                          saving={saving}
                        />
                      ) : (
                        <DeadlineItem
                          deadline={deadline}
                          status={getDeadlineStatus(deadline.date)}
                          isAdmin={isAdmin}
                          onEdit={() => setEditingDeadline(deadline)}
                          onDelete={() => handleDeleteDeadline(deadline.id)}
                        />
                      )}
                    </div>
                  ))}

                {(!config?.deadlines || config.deadlines.length === 0) && !isAddingDeadline && (
                  <p className="font-urbanist text-[13px] text-white/20 text-center py-10">
                    No deadlines set yet.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Resources Section */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(34,197,94,0.08)' }}
                  >
                    <LinkIcon className="h-4 w-4" style={{ color: '#4ade80' }} />
                  </div>
                  <h2 className="text-[14px] font-semibold text-white">Resources</h2>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => setIsAddingResource(true)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 transition-colors duration-200"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>

              {isAddingResource && (
                <ResourceForm
                  onSave={handleAddResource}
                  onCancel={() => setIsAddingResource(false)}
                  saving={saving}
                />
              )}

              <div className="space-y-2">
                {(config?.resources || []).map((resource) => (
                  <div key={resource.id}>
                    {editingResource?.id === resource.id ? (
                      <ResourceForm
                        resource={editingResource}
                        onSave={(r) => handleUpdateResource(r as DashboardResource)}
                        onCancel={() => setEditingResource(null)}
                        saving={saving}
                      />
                    ) : (
                      <ResourceItem
                        resource={resource}
                        isAdmin={isAdmin}
                        onEdit={() => setEditingResource(resource)}
                        onDelete={() => handleDeleteResource(resource.id)}
                      />
                    )}
                  </div>
                ))}

                {(!config?.resources || config.resources.length === 0) && !isAddingResource && (
                  <p className="font-urbanist text-[13px] text-white/20 text-center py-10">
                    No resources added yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cache notice */}
        <p className="font-urbanist text-[11px] text-white/15 mt-6 text-center">
          Dashboard data is cached for up to 5 minutes.
        </p>
      </div>
    </div>
  );
}

// Deadline Item Component
function DeadlineItem({
  deadline,
  status,
  isAdmin,
  onEdit,
  onDelete,
}: {
  deadline: DashboardDeadline;
  status: "past" | "today" | "tomorrow" | "soon" | "future";
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const statusStyles: Record<string, { color: string; bg: string; border: string; label: string | null }> = {
    past: { color: 'rgba(255,255,255,0.25)', bg: '', border: '', label: null },
    today: { color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.15)', label: 'Today' },
    tomorrow: { color: '#fbbf24', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.15)', label: 'Tomorrow' },
    soon: { color: '#facc15', bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.15)', label: 'This week' },
    future: { color: 'rgba(255,255,255,0.6)', bg: '', border: '', label: null },
  };

  const s = statusStyles[status];

  return (
    <div
      className="p-4 rounded-lg group"
      style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={clsx("text-[14px] font-semibold", status === 'past' && "line-through")}
              style={{ color: s.color }}
            >
              {deadline.title}
            </span>
            {s.label && (
              <span
                className="px-2 py-0.5 text-[10px] font-semibold tracking-wider rounded-md uppercase"
                style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.color }}
              >
                {s.label}
              </span>
            )}
          </div>
          <p className="font-urbanist text-[12px] text-white/25">
            {format(parseISO(deadline.date), "EEEE, MMMM d, yyyy")}
          </p>
          {deadline.description && (
            <p className="font-urbanist text-[12px] text-white/20 mt-1">{deadline.description}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={onEdit}
              className="w-7 h-7 rounded-md flex items-center justify-center text-white/25 hover:text-white/60 transition-colors duration-200"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            >
              <Edit2 className="h-3 w-3" />
            </button>
            <button
              onClick={onDelete}
              className="w-7 h-7 rounded-md flex items-center justify-center text-white/25 hover:text-red-400 transition-colors duration-200"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Deadline Form Component
function DeadlineForm({
  deadline,
  onSave,
  onCancel,
  saving,
}: {
  deadline?: DashboardDeadline;
  onSave: (deadline: DashboardDeadline | Omit<DashboardDeadline, "id">) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(deadline?.title || "");
  const [date, setDate] = useState(deadline?.date || format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState(deadline?.description || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;

    if (deadline) {
      onSave({ ...deadline, title, date, description: description || undefined });
    } else {
      onSave({ title, date, description: description || undefined });
    }
  };

  const inputStyle = {
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg mb-3 space-y-2.5 p-4" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Deadline title"
        className="w-full px-3 py-2 rounded-lg text-[13px] text-white placeholder-white/20 focus:outline-none focus:ring-1 font-urbanist"
        style={{ ...inputStyle, outlineColor: 'var(--lhr-blue)' }}
        required
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-[13px] text-white focus:outline-none focus:ring-1 font-urbanist"
        style={{ ...inputStyle, outlineColor: 'var(--lhr-blue)', colorScheme: 'dark' }}
        required
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full px-3 py-2 rounded-lg text-[13px] text-white placeholder-white/20 focus:outline-none focus:ring-1 font-urbanist"
        style={{ ...inputStyle, outlineColor: 'var(--lhr-blue)' }}
      />
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-4 text-[12px] font-semibold tracking-wide text-white/40 hover:text-white/60 transition-colors duration-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !title || !date}
          className="h-8 px-4 rounded-lg text-[12px] font-semibold tracking-wide transition-all duration-200 disabled:opacity-40"
          style={{ backgroundColor: 'var(--lhr-blue)', color: '#fff' }}
        >
          {saving ? "Saving..." : deadline ? "Update" : "Add"}
        </button>
      </div>
    </form>
  );
}

// Resource Item Component
function ResourceItem({
  resource,
  isAdmin,
  onEdit,
  onDelete,
}: {
  resource: DashboardResource;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="p-4 rounded-lg group"
      style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group/link inline-flex items-center gap-1.5 text-[14px] font-semibold text-white hover:underline underline-offset-4 decoration-white/20 transition-colors duration-200"
          >
            {resource.title}
            <ExternalLink className="h-3 w-3 text-white/25" />
          </a>
          {resource.description && (
            <p className="font-urbanist text-[12px] text-white/20 mt-1">{resource.description}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={onEdit}
              className="w-7 h-7 rounded-md flex items-center justify-center text-white/25 hover:text-white/60 transition-colors duration-200"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            >
              <Edit2 className="h-3 w-3" />
            </button>
            <button
              onClick={onDelete}
              className="w-7 h-7 rounded-md flex items-center justify-center text-white/25 hover:text-red-400 transition-colors duration-200"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Resource Form Component
function ResourceForm({
  resource,
  onSave,
  onCancel,
  saving,
}: {
  resource?: DashboardResource;
  onSave: (resource: DashboardResource | Omit<DashboardResource, "id">) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(resource?.title || "");
  const [url, setUrl] = useState(resource?.url || "");
  const [description, setDescription] = useState(resource?.description || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !url) return;

    if (resource) {
      onSave({ ...resource, title, url, description: description || undefined });
    } else {
      onSave({ title, url, description: description || undefined });
    }
  };

  const inputStyle = {
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg mb-3 space-y-2.5 p-4" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Resource title"
        className="w-full px-3 py-2 rounded-lg text-[13px] text-white placeholder-white/20 focus:outline-none focus:ring-1 font-urbanist"
        style={{ ...inputStyle, outlineColor: 'var(--lhr-blue)' }}
        required
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="URL"
        className="w-full px-3 py-2 rounded-lg text-[13px] text-white placeholder-white/20 focus:outline-none focus:ring-1 font-urbanist"
        style={{ ...inputStyle, outlineColor: 'var(--lhr-blue)' }}
        required
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full px-3 py-2 rounded-lg text-[13px] text-white placeholder-white/20 focus:outline-none focus:ring-1 font-urbanist"
        style={{ ...inputStyle, outlineColor: 'var(--lhr-blue)' }}
      />
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-4 text-[12px] font-semibold tracking-wide text-white/40 hover:text-white/60 transition-colors duration-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !title || !url}
          className="h-8 px-4 rounded-lg text-[12px] font-semibold tracking-wide transition-all duration-200 disabled:opacity-40"
          style={{ backgroundColor: 'var(--lhr-blue)', color: '#fff' }}
        >
          {saving ? "Saving..." : resource ? "Update" : "Add"}
        </button>
      </div>
    </form>
  );
}
