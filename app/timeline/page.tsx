import type { Metadata } from "next";
import Link from "next/link";
import BrandStripes from "@/components/BrandStripes";
import ImageLightbox from "@/components/ImageLightbox";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Timeline",
  description:
    "Key dates, events, and info sessions for the Longhorn Racing recruiting cycle.",
  alternates: { canonical: "/timeline" },
};

const INSTAGRAM_URL = "https://www.instagram.com/longhornracing/";
const RECRUITING_EMAIL = "longhornracingrecruitment@gmail.com";

// Static graphics exported from the recruiting announcement set. The wide
// banner is the cycle overview; the three cards break out dates, events, and
// info sessions.
const CARDS = [
  { src: "/timeline/dates.avif", alt: "Key recruiting dates", width: 435, height: 544 },
  { src: "/timeline/events.avif", alt: "Recruiting events", width: 435, height: 544 },
  { src: "/timeline/info_sessions.avif", alt: "Info session schedule", width: 435, height: 544 },
];

export default function TimelinePage() {
  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div className="pub-page-bg" />

      <div className="container mx-auto px-6 md:px-10 max-w-5xl">
        {/* Page Header */}
        <section className="mb-12 animate-fade-slide-up">
          <p
            className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
            style={{ color: "var(--pub-text-3)" }}
          >
            Recruiting Timeline
          </p>
          <h1
            className="text-3xl md:text-5xl font-bold tracking-tight mb-4"
            style={{ color: "var(--pub-heading)" }}
          >
            Key dates.{" "}
            <span style={{ color: "var(--pub-heading-accent)" }}>Mark your calendar.</span>
          </h1>
          <p
            className="font-urbanist text-[15px] max-w-xl leading-relaxed"
            style={{ color: "var(--pub-text-2)" }}
          >
            Every info session, deadline, and event for this recruiting cycle, all in
            one place. Click any graphic to view it full screen.
          </p>
          <BrandStripes className="mt-8" animated />
        </section>

        {/* Disclaimer, deliberately loud: this page is a snapshot, Instagram
            and email carry the freshest word. */}
        <Reveal className="mb-12">
          <div
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: "var(--status-warn-bg)",
              border: "1px solid var(--status-warn-border)",
            }}
          >
            <div className="h-1" style={{ backgroundColor: "var(--lhr-gold)" }} />
            <div className="p-7 md:p-8">
              <p
                className="text-[11px] font-semibold tracking-[0.25em] uppercase mb-3"
                style={{ color: "var(--status-warn-ink)" }}
              >
                Before you plan around this page
              </p>
              <h2
                className="text-xl md:text-2xl font-bold mb-3"
                style={{ color: "var(--pub-heading)" }}
              >
                Instagram always has the latest
              </h2>
              <p
                className="font-urbanist text-[14px] leading-relaxed max-w-2xl mb-3"
                style={{ color: "var(--pub-text)" }}
              >
                Schedules shift. Our Instagram always carries the most recent
                information, including corrections and last-minute changes that may not
                be reflected here yet. If this page and Instagram disagree, trust
                Instagram.
              </p>
              <p
                className="font-urbanist text-[14px] leading-relaxed max-w-2xl mb-6"
                style={{ color: "var(--pub-text)" }}
              >
                Also keep an eye on your email, including your spam folder. Official
                updates about your application are sent from our recruitment email,{" "}
                <a
                  href={`mailto:${RECRUITING_EMAIL}`}
                  className="underline hover:opacity-80 transition-opacity"
                  style={{ color: "var(--pub-link)" }}
                >
                  {RECRUITING_EMAIL}
                </a>
                .
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-11 px-7 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200"
                  style={{ backgroundColor: "var(--pub-cta)", color: "var(--pub-cta-ink)" }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                  Follow @longhornracing
                </Link>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Cycle overview banner */}
        <Reveal className="mb-6">
          <div
            className="rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
            style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
          >
            <ImageLightbox
              src="/timeline/timeline.avif"
              alt="Recruiting cycle timeline overview"
              width={1215}
              height={379}
              sizes="(min-width: 1024px) 976px, 100vw"
            />
          </div>
        </Reveal>

        {/* Dates / events / info sessions */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CARDS.map((card, index) => (
            <Reveal key={card.src} delay={index * 90}>
              <div
                className="rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
                style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
              >
                <ImageLightbox
                  src={card.src}
                  alt={card.alt}
                  width={card.width}
                  height={card.height}
                  sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
                />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </main>
  );
}
