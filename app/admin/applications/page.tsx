"use client";

import { FileText } from "lucide-react";

export default function AdminApplicationsPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center" style={{ background: "#030608" }}>
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ backgroundColor: "rgba(4,95,133,0.1)", border: "1px solid rgba(4,95,133,0.15)" }}
      >
        <FileText className="h-7 w-7" style={{ color: "var(--lhr-blue)" }} />
      </div>
      <p className="font-montserrat text-[15px] font-semibold text-white/40">
        Select an applicant to view details
      </p>
      <p className="font-urbanist text-[13px] text-white/20 mt-1">
        Choose from the sidebar to get started
      </p>
    </div>
  );
}
