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
      <div className="p-12 text-neutral-500">Loading dashboard...</div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
      <p className="text-neutral-400 mb-8">Overview of recruiting status and team resources.</p>

      {/* Pending Reviews Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Pending Reviews Card */}
        <div className="bg-neutral-900 border border-white/5 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Users className="h-5 w-5 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold text-white">Pending Reviews</h2>
          </div>
          
          <div className="text-4xl font-bold text-white mb-2">
            {counts?.pendingReviews.total || 0}
          </div>
          <p className="text-neutral-400 text-sm mb-4">Applications awaiting initial review</p>
          
          {counts && Object.keys(counts.pendingReviews.byGroup).length > 0 && (
            <div className="space-y-2 border-t border-white/5 pt-4">
              {Object.entries(counts.pendingReviews.byGroup)
                .sort((a, b) => b[1] - a[1])
                .map(([group, count]) => (
                  <div key={group} className="flex justify-between text-sm">
                    <span className="text-neutral-400">{group}</span>
                    <span className="text-white font-medium">{count}</span>
                  </div>
                ))}
            </div>
          )}
          
          <a
            href="/admin/applications"
            className="mt-4 inline-flex items-center gap-2 text-sm text-orange-500 hover:text-orange-400 transition-colors"
          >
            View applications →
          </a>
        </div>

        {/* Pending Decisions Card */}
        <div className="bg-neutral-900 border border-white/5 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-white">Pending Decisions</h2>
          </div>
          
          <div className="text-4xl font-bold text-white mb-2">
            {counts?.pendingDecisions.total || 0}
          </div>
          <p className="text-neutral-400 text-sm mb-4">In interview/trial stage awaiting final decision</p>
          
          {counts && Object.keys(counts.pendingDecisions.byGroup).length > 0 && (
            <div className="space-y-2 border-t border-white/5 pt-4">
              {Object.entries(counts.pendingDecisions.byGroup)
                .sort((a, b) => b[1] - a[1])
                .map(([group, count]) => (
                  <div key={group} className="flex justify-between text-sm">
                    <span className="text-neutral-400">{group}</span>
                    <span className="text-white font-medium">{count}</span>
                  </div>
                ))}
            </div>
          )}
          
          <a
            href="/admin/applications"
            className="mt-4 inline-flex items-center gap-2 text-sm text-blue-500 hover:text-blue-400 transition-colors"
          >
            View applications →
          </a>
        </div>
      </div>

      {/* Deadlines and Resources Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Deadlines Section */}
        <div className="bg-neutral-900 border border-white/5 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold text-white">Deadlines</h2>
            </div>
            {isAdmin && (
              <button
                onClick={() => setIsAddingDeadline(true)}
                className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <Plus className="h-5 w-5" />
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

          <div className="space-y-3">
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
              <p className="text-neutral-500 text-sm text-center py-8">
                No deadlines set yet.
              </p>
            )}
          </div>
        </div>

        {/* Resources Section */}
        <div className="bg-neutral-900 border border-white/5 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <LinkIcon className="h-5 w-5 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold text-white">Resources</h2>
            </div>
            {isAdmin && (
              <button
                onClick={() => setIsAddingResource(true)}
                className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <Plus className="h-5 w-5" />
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

          <div className="space-y-3">
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
              <p className="text-neutral-500 text-sm text-center py-8">
                No resources added yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Cache notice */}
      <p className="text-neutral-500 text-xs mt-6 text-center">
        Dashboard data is cached for up to 5 minutes. Changes may take a few minutes to appear.
      </p>
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
  const statusColors = {
    past: "text-neutral-500 line-through",
    today: "text-red-400",
    tomorrow: "text-orange-400",
    soon: "text-yellow-400",
    future: "text-neutral-300",
  };

  const statusBadges = {
    past: null,
    today: <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">Today</span>,
    tomorrow: <span className="px-2 py-0.5 text-xs bg-orange-500/20 text-orange-400 rounded">Tomorrow</span>,
    soon: <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">This week</span>,
    future: null,
  };

  return (
    <div className="p-3 bg-neutral-800/50 rounded-lg group">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx("font-medium", statusColors[status])}>
              {deadline.title}
            </span>
            {statusBadges[status]}
          </div>
          <p className="text-sm text-neutral-400">
            {format(parseISO(deadline.date), "EEEE, MMMM d, yyyy")}
          </p>
          {deadline.description && (
            <p className="text-sm text-neutral-500 mt-1">{deadline.description}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            >
              <Trash2 className="h-4 w-4" />
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

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-neutral-800 rounded-lg mb-3 space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Deadline title"
        className="w-full px-3 py-2 bg-neutral-700 border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
        required
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full px-3 py-2 bg-neutral-700 border border-white/10 rounded-lg text-white focus:outline-none focus:border-orange-500"
        required
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full px-3 py-2 bg-neutral-700 border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !title || !date}
          className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
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
    <div className="p-3 bg-neutral-800/50 rounded-lg group">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-white hover:text-orange-400 transition-colors inline-flex items-center gap-2"
          >
            {resource.title}
            <ExternalLink className="h-4 w-4" />
          </a>
          {resource.description && (
            <p className="text-sm text-neutral-500 mt-1">{resource.description}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            >
              <Trash2 className="h-4 w-4" />
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

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-neutral-800 rounded-lg mb-3 space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Resource title (e.g., Slack, Recruitment Slides)"
        className="w-full px-3 py-2 bg-neutral-700 border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
        required
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="URL (e.g., https://slack.com/...)"
        className="w-full px-3 py-2 bg-neutral-700 border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
        required
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full px-3 py-2 bg-neutral-700 border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !title || !url}
          className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : resource ? "Update" : "Add"}
        </button>
      </div>
    </form>
  );
}
