"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { FaqConfig } from "@/lib/models/Config";
import { routes } from "@/lib/routes";

export default function FaqPage() {
  const [config, setConfig] = useState<FaqConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFaq() {
      try {
        const response = await fetch("/api/faq");
        if (response.ok) {
          const data = await response.json();
          setConfig(data.config);
          // Open the first question so the page doesn't read as a wall of bars.
          setOpenId(data.config?.items?.[0]?.id ?? null);
        }
      } catch (error) {
        console.error("Failed to fetch FAQ:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchFaq();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen pt-24 pb-20" style={{ background: "#030608" }}>
        <div className="container mx-auto px-6 md:px-10 max-w-3xl">
          <div className="animate-pulse flex flex-col gap-4">
            <div className="h-4 w-28 rounded" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
            <div className="h-10 w-80 rounded" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
            <div className="h-16 w-full rounded-xl mt-6" style={{ backgroundColor: "rgba(255,255,255,0.02)" }} />
            <div className="h-16 w-full rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.02)" }} />
            <div className="h-16 w-full rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.02)" }} />
          </div>
        </div>
      </main>
    );
  }

  const items = config?.items ?? [];

  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, rgba(4,95,133,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 100%, rgba(255,181,38,0.04) 0%, transparent 40%), #030608",
        }}
      />

      <div className="container mx-auto px-6 md:px-10 max-w-3xl">
        {/* Header */}
        <p
          className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
          style={{ color: "var(--lhr-gray-blue)" }}
        >
          Questions & Answers
        </p>
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-3">
          Frequently asked questions
        </h1>
        <p className="font-urbanist text-[15px] leading-relaxed mb-10" style={{ color: "var(--lhr-gray-blue)" }}>
          Everything we get asked most often about joining Longhorn Racing.
        </p>

        {/* Questions */}
        {items.length === 0 ? (
          <div
            className="p-6 rounded-xl font-urbanist text-[14px]"
            style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--lhr-gray-blue)" }}
          >
            No questions have been published yet — check back soon.
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => {
              const isOpen = openId === item.id;
              return (
                <div
                  key={item.id}
                  className="rounded-xl overflow-hidden transition-colors duration-200"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.02)",
                    border: `1px solid ${isOpen ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer"
                  >
                    <span className="text-[15px] font-semibold text-white">{item.question}</span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 transition-transform duration-200"
                      style={{
                        color: "var(--lhr-gray-blue)",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 -mt-1">
                      <p
                        className="font-urbanist text-[14px] leading-relaxed whitespace-pre-wrap"
                        style={{ color: "var(--lhr-gray-blue)" }}
                      >
                        {item.answer}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div
          className="mt-12 p-7 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div>
            <h2 className="text-[15px] font-semibold text-white mb-1">Still have a question?</h2>
            <p className="font-urbanist text-[13px]" style={{ color: "var(--lhr-gray-blue)" }}>
              Reach out and we&apos;ll get back to you.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Link
              href="/contact"
              className="inline-flex items-center h-10 px-5 rounded-lg text-[13px] font-semibold transition-colors"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              Contact us
            </Link>
            <Link
              href={routes.apply}
              className="inline-flex items-center h-10 px-5 rounded-lg text-[13px] font-semibold transition-colors"
              style={{ backgroundColor: "var(--lhr-gold)", color: "#000" }}
            >
              Apply
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
