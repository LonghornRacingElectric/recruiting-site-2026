"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FaqItem } from "@/lib/models/Config";

/**
 * Accordion for FAQ items. Receives items from the server component so the
 * content is in the initial HTML; this component only owns the open/close
 * interaction. Expansion animates via the CSS grid 0fr→1fr trick, which
 * animates to content height without measuring it.
 */
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className="rounded-xl overflow-hidden transition-colors duration-200"
            style={{
              backgroundColor: "var(--pub-surface)",
              border: `1px solid ${isOpen ? "var(--pub-border-strong)" : "var(--pub-border)"}`,
            }}
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer"
            >
              <span className="text-[15px] font-semibold" style={{ color: "var(--pub-heading)" }}>{item.question}</span>
              <ChevronDown
                className="h-4 w-4 shrink-0 transition-transform duration-300"
                style={{
                  color: "var(--pub-text-3)",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <p
                  className="px-6 pb-5 font-urbanist text-[14px] leading-relaxed whitespace-pre-wrap"
                  style={{ color: "var(--pub-text)" }}
                >
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
