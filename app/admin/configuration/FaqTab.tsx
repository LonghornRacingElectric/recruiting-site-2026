"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FaqConfig, FaqItem } from "@/lib/models/Config";
import { Plus, Trash2, Save, ChevronUp, ChevronDown, Loader2, Clock } from "lucide-react";

export function FaqTab() {
  const [config, setConfig] = useState<FaqConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/config/faq");
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
      } else {
        toast.error("Failed to load FAQ configuration");
      }
    } catch (err) {
      console.error("Failed to fetch FAQ config", err);
      toast.error("Failed to load FAQ configuration");
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (index: number, field: keyof FaqItem, value: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  const addItem = () => {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: [
          ...prev.items,
          { id: `faq_${Date.now()}`, question: "", answer: "" },
        ],
      };
    });
  };

  const removeItem = (index: number) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.filter((_, i) => i !== index) };
    });
  };

  /** Array order is the order visitors see, so this is how you sort the page. */
  const moveItem = (index: number, delta: number) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const target = index + delta;
      if (target < 0 || target >= prev.items.length) return prev;
      const items = [...prev.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...prev, items };
    });
  };

  const save = async () => {
    if (!config) return;

    const blank = config.items.filter((i) => !i.question.trim()).length;
    if (blank > 0) {
      toast.error(`${blank} question${blank > 1 ? "s have" : " has"} no text — fill it in or remove it`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/config/faq", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: config.items }),
      });

      if (res.ok) {
        toast.success("FAQ updated!");
        fetchConfig();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to save");
      }
    } catch (err) {
      console.error("Failed to save FAQ config", err);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-10">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--lhr-blue)" }} />
        <span className="font-urbanist text-[13px] text-white/30">Loading FAQ...</span>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-montserrat text-[16px] font-bold text-white mb-1">FAQ Page</h2>
          <p className="font-urbanist text-[13px] text-white/30">
            Questions appear on <span className="text-white/50">/faq</span> in the order below.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 inline-flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-40 cursor-pointer"
          style={{ backgroundColor: "var(--lhr-gold)", color: "#000" }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {config.updatedAt && (
        <div className="flex items-center gap-1.5 font-urbanist text-[11px] text-white/25">
          <Clock className="h-3 w-3" />
          Last updated {new Date(config.updatedAt).toLocaleString()}
        </div>
      )}

      {/* Items */}
      {config.items.length === 0 ? (
        <div
          className="p-6 rounded-xl font-urbanist text-[13px] text-white/30"
          style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
        >
          No questions yet. Add one below — the page will show an empty state until you do.
        </div>
      ) : (
        <div className="space-y-3">
          {config.items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-lg p-4"
              style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
            >
              <div className="flex items-start gap-3">
                {/* Reorder controls */}
                <div className="flex flex-col items-center gap-1 pt-0.5">
                  <button
                    type="button"
                    aria-label="Move question up"
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                    className="w-6 h-6 rounded flex items-center justify-center transition-colors disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)" }}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[10px] font-semibold tabular-nums" style={{ color: "rgba(255,255,255,0.25)" }}>
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    aria-label="Move question down"
                    disabled={index === config.items.length - 1}
                    onClick={() => moveItem(index, 1)}
                    className="w-6 h-6 rounded flex items-center justify-center transition-colors disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)" }}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex-1 space-y-3 min-w-0">
                  <div>
                    <label className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>
                      Question
                    </label>
                    <input
                      type="text"
                      value={item.question}
                      onChange={(e) => updateItem(index, "question", e.target.value)}
                      placeholder="e.g. Do I need prior experience?"
                      className="w-full px-3 py-2 rounded-lg text-[13px] text-white placeholder-white/20 focus:outline-none focus:ring-1"
                      style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>
                      Answer
                    </label>
                    <textarea
                      value={item.answer}
                      onChange={(e) => updateItem(index, "answer", e.target.value)}
                      placeholder="Keep it short and plain — line breaks are preserved."
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg text-[13px] text-white placeholder-white/20 focus:outline-none focus:ring-1 resize-y font-urbanist"
                      style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => removeItem(index)}
                  aria-label="Delete question"
                  className="shrink-0 p-2 rounded-md transition-colors cursor-pointer"
                  style={{ color: "rgba(239,68,68,0.6)" }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addItem}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer"
        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
      >
        <Plus className="h-4 w-4" />
        Add Question
      </button>
    </div>
  );
}
