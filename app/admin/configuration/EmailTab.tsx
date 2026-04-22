"use client";

import { useState, useEffect } from "react";
import { EmailTemplatesConfig, EmailTemplate, EmailTrigger } from "@/lib/models/EmailTemplate";
import { Switch } from "@/components/ui/switch";
import { Mail, Loader2, Save, Send, Code, ShieldAlert, AlertCircle, RefreshCw } from "lucide-react";

export function EmailTab() {
  const [config, setConfig] = useState<EmailTemplatesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Test email state
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [testTemplateId, setTestTemplateId] = useState<string>("");

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/config/email");
      if (!res.ok) throw new Error("Failed to fetch email configuration");
      const data = await res.json();
      setConfig(data);
      if (data.templates && data.templates.length > 0) {
        setTestTemplateId(data.templates[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/admin/config/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed to save email configuration");
      setSuccessMsg("Email configuration saved successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmailAddress) {
      setError("Please enter a valid email address for testing");
      return;
    }
    if (!testTemplateId || !config) return;

    const template = config.templates.find(t => t.id === testTemplateId);
    if (!template) return;

    setTestEmailSending(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/admin/config/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testEmailAddress,
          subject: template.subject,
          body: template.body,
          variables: {
            applicantName: "Test Applicant",
            applicantFirstName: "Test",
            applicantEmail: testEmailAddress,
            teamName: "Electric Team",
            systemNames: "Software, Hardware",
            organizationName: "Longhorn Racing",
          }
        }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to send test email");
      }
      
      setSuccessMsg(`Test email successfully sent to ${testEmailAddress}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestEmailSending(false);
    }
  };

  const updateTemplate = (id: string, updates: Partial<EmailTemplate>) => {
    if (!config) return;
    setConfig({
      ...config,
      templates: config.templates.map(t => t.id === id ? { ...t, ...updates } : t)
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-white/50">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading email configuration...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center">
        <AlertCircle className="h-5 w-5 mr-3" />
        Failed to load configuration. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Global Actions */}
      <div className="bg-[#0A0D10] border border-white/10 rounded-2xl p-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white mb-1 flex items-center">
            <Mail className="h-5 w-5 mr-2 text-[var(--lhr-gold)]" />
            Email System Configuration
          </h2>
          <p className="text-sm text-white/50">
            Manage automated email notifications and templates using AWS SES.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-xl border border-white/5">
            <span className="text-sm font-medium text-white/80">Global Enable</span>
            <Switch 
              checked={config.globalEnabled}
              onCheckedChange={(c) => setConfig({ ...config, globalEnabled: c })}
              className={config.globalEnabled ? "!bg-green-500" : "!bg-white/20"}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-5 py-2.5 bg-[var(--lhr-gold)] hover:bg-[#d4740a] text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center animate-fadeSlideUp">
          <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0" />
          {error}
        </div>
      )}

      {successMsg && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl flex items-center animate-fadeSlideUp">
          <ShieldAlert className="h-5 w-5 mr-3 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Templates List */}
        <div className="lg:col-span-2 space-y-6">
          {config.templates.map((template) => (
            <div key={template.id} className="bg-[#0A0D10] border border-white/10 rounded-2xl overflow-hidden transition-all focus-within:border-[var(--lhr-gold)]/50 focus-within:ring-1 focus-within:ring-[var(--lhr-gold)]/50">
              {/* Template Header */}
              <div className="bg-white/5 px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-white text-base">{template.name}</h3>
                  <p className="text-xs text-white/40 font-mono mt-0.5 tracking-wide uppercase">Trigger: {template.trigger}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">{template.enabled ? 'Enabled' : 'Disabled'}</span>
                  <Switch 
                    checked={template.enabled}
                    onCheckedChange={(c) => updateTemplate(template.id, { enabled: c })}
                    className={template.enabled ? "!bg-green-500" : "!bg-white/20"}
                  />
                </div>
              </div>
              
              {/* Template Body */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={template.subject}
                    onChange={(e) => updateTemplate(template.id, { subject: e.target.value })}
                    className="w-full bg-[#030608] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[var(--lhr-gold)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                    Email Body (Markdown)
                  </label>
                  <textarea
                    value={template.body}
                    onChange={(e) => updateTemplate(template.id, { body: e.target.value })}
                    rows={8}
                    className="w-full bg-[#030608] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[var(--lhr-gold)] font-mono resize-y"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Variables Reference */}
          <div className="bg-[#0A0D10] border border-white/10 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center">
              <Code className="h-4 w-4 mr-2 text-white/50" />
              Template Variables
            </h3>
            <p className="text-xs text-white/50 mb-4 leading-relaxed">
              Use these variables in your subject or body. They will be replaced with actual data when the email is sent.
            </p>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <code className="text-xs text-[var(--lhr-gold)] bg-[var(--lhr-gold)]/10 px-2 py-1 rounded w-fit">{'{{applicantName}}'}</code>
                <span className="text-xs text-white/40 pl-1">The applicant's full name.</span>
              </div>
              <div className="flex flex-col gap-1">
                <code className="text-xs text-[var(--lhr-gold)] bg-[var(--lhr-gold)]/10 px-2 py-1 rounded w-fit">{'{{applicantFirstName}}'}</code>
                <span className="text-xs text-white/40 pl-1">The applicant's first name.</span>
              </div>
              <div className="flex flex-col gap-1">
                <code className="text-xs text-[var(--lhr-gold)] bg-[var(--lhr-gold)]/10 px-2 py-1 rounded w-fit">{'{{teamName}}'}</code>
                <span className="text-xs text-white/40 pl-1">The team they applied to (e.g., Electric).</span>
              </div>
              <div className="flex flex-col gap-1">
                <code className="text-xs text-[var(--lhr-gold)] bg-[var(--lhr-gold)]/10 px-2 py-1 rounded w-fit">{'{{systemNames}}'}</code>
                <span className="text-xs text-white/40 pl-1">List of systems (e.g., Software, Hardware).</span>
              </div>
              <div className="flex flex-col gap-1">
                <code className="text-xs text-[var(--lhr-gold)] bg-[var(--lhr-gold)]/10 px-2 py-1 rounded w-fit">{'{{organizationName}}'}</code>
                <span className="text-xs text-white/40 pl-1">The organization name (e.g., Longhorn Racing).</span>
              </div>
            </div>
          </div>

          {/* Test Sandbox */}
          <div className="bg-[#0A0D10] border border-white/10 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center">
              <Send className="h-4 w-4 mr-2 text-[var(--lhr-gold)]" />
              Test Sandbox
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">
                  Template to Test
                </label>
                <select
                  value={testTemplateId}
                  onChange={(e) => setTestTemplateId(e.target.value)}
                  className="w-full bg-[#030608] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--lhr-gold)]"
                >
                  {config.templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">
                  Recipient Email
                </label>
                <input
                  type="email"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full bg-[#030608] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--lhr-gold)]"
                />
              </div>
              <button
                onClick={handleTestEmail}
                disabled={testEmailSending || !testEmailAddress}
                className="w-full flex items-center justify-center px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {testEmailSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send Test Email
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
