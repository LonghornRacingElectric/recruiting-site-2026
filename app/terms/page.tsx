import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Longhorn Racing Recruiting",
  description: "Terms for using the Longhorn Racing recruiting platform.",
};

const LAST_UPDATED = "August 3, 2026";
const CONTACT_EMAIL = "longhornracingrecruitment@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-[17px] font-bold mb-3" style={{ color: "var(--pub-heading)" }}>{title}</h2>
      <div
        className="font-urbanist text-[14px] leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5"
        style={{ color: "var(--pub-text)" }}
      >
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div className="pub-page-bg" />

      <div className="container mx-auto px-6 md:px-10 max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-4" style={{ color: "var(--pub-text-3)" }}>
          Legal
        </p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2" style={{ color: "var(--pub-heading)" }}>
          Terms of Service
        </h1>
        <p className="font-urbanist text-[13px] mb-12" style={{ color: "var(--pub-text-3)" }}>
          Last updated: {LAST_UPDATED}
        </p>

        <Section title="Agreement">
          <p>
            This site is the recruiting platform for Longhorn Racing (&ldquo;LHR&rdquo;,
            &ldquo;we&rdquo;, &ldquo;us&rdquo;), a registered student organization at The University
            of Texas at Austin. By using the site or signing in, you agree to these terms and
            acknowledge our{" "}
            <Link href="/privacy" className="underline" style={{ color: "var(--pub-link)" }}>Privacy Policy</Link>. If you
            don&apos;t agree, please don&apos;t use the site.
          </p>
        </Section>

        <Section title="Accounts">
          <p>
            You sign in with your own Google account. Keep your account to yourself: don&apos;t sign
            in as someone else, share access to your application, or create accounts for anyone but
            you. You&apos;re responsible for activity that happens under your account.
          </p>
        </Section>

        <Section title="Applications and recruiting decisions">
          <ul>
            <li>Everything you submit in an application must be your own work and truthful.
              Misrepresenting your background or experience may result in removal from the process.</li>
            <li>Submitting an application is not a guarantee of an interview, a trial workday, or
              membership. All recruiting decisions are made at LHR&apos;s discretion and are final.</li>
            <li>Deadlines, application questions, and the stages of the recruiting process may
              change during a cycle. We&apos;ll communicate changes through the site or by email.</li>
            <li>Interview and event details shared with you through the site (such as scheduling
              links) are for your use only — please don&apos;t redistribute them.</li>
          </ul>
        </Section>

        <Section title="Your content">
          <p>
            You own what you submit — your answers, resume, and portfolio. By submitting, you give
            LHR permission to store, review, and share that content internally for recruiting
            purposes. Don&apos;t upload anything unlawful, malicious (including malware), or that
            you don&apos;t have the right to share.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>Don&apos;t:</p>
          <ul>
            <li>Attempt to access other applicants&apos; data or staff-only areas of the site</li>
            <li>Probe, disrupt, overload, or interfere with the site or its infrastructure</li>
            <li>Scrape the site or harvest information about other users</li>
            <li>Use the site for anything other than applying to and participating in LHR
              recruiting</li>
          </ul>
          <p>
            We may suspend or restrict accounts that violate these terms or abuse the recruiting
            process.
          </p>
        </Section>

        <Section title="Availability and changes">
          <p>
            The site is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
            warranties of any kind. It&apos;s run by student volunteers; we do our best, but we
            don&apos;t promise the site will always be available, error-free, or that data will
            never be lost. Keep copies of anything important you submit. We may modify or
            discontinue features at any time.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the fullest extent permitted by law, LHR and its members are not liable for indirect,
            incidental, or consequential damages arising from your use of the site — including
            missed deadlines, lost data, or recruiting outcomes. Your use of the site is at your own
            risk.
          </p>
        </Section>

        <Section title="Relationship to the University">
          <p>
            Longhorn Racing is a registered student organization at The University of Texas at
            Austin. This site and its content are the organization&apos;s own and are not an
            official communication of the University. Membership decisions made through this site
            are organizational decisions, not University ones.
          </p>
        </Section>

        <Section title="Governing law">
          <p>These terms are governed by the laws of the State of Texas.</p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            If we change these terms, we&apos;ll update this page and the date at the top. Continuing
            to use the site after changes means you accept the updated terms.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline" style={{ color: "var(--pub-link)" }}>{CONTACT_EMAIL}</a>
          </p>
        </Section>
      </div>
    </main>
  );
}
