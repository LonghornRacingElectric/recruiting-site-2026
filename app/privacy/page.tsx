import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Longhorn Racing Recruiting",
  description: "How the Longhorn Racing recruiting platform collects, uses, and protects your information.",
};

const LAST_UPDATED = "August 3, 2026";
const CONTACT_EMAIL = "longhornracingrecruitment@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-[17px] font-bold text-white mb-3">{title}</h2>
      <div
        className="font-urbanist text-[14px] leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5"
        style={{ color: "var(--lhr-gray-blue)" }}
      >
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, rgba(4,95,133,0.08) 0%, transparent 50%), #030608",
        }}
      />

      <div className="container mx-auto px-6 md:px-10 max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-4" style={{ color: "var(--lhr-gray-blue)" }}>
          Legal
        </p>
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">
          Privacy Policy
        </h1>
        <p className="font-urbanist text-[13px] mb-12" style={{ color: "rgba(255,255,255,0.35)" }}>
          Last updated: {LAST_UPDATED}
        </p>

        <Section title="Who we are">
          <p>
            This site is the recruiting platform for Longhorn Racing (&ldquo;LHR&rdquo;,
            &ldquo;we&rdquo;, &ldquo;us&rdquo;), a registered student organization at The University
            of Texas at Austin. We use it to accept and review applications to our Electric, Solar,
            and Combustion teams. This site is run by students and is not an official publication of
            The University of Texas at Austin.
          </p>
          <p>
            This policy describes what information the site collects, how it is used, and the
            choices you have. Questions and requests go to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-white/70 underline">{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section title="Information we collect">
          <p><strong className="text-white/70">Account information.</strong> You sign in with a Google
            account. We receive your name, email address, and Google account identifier. We do not
            see your password.</p>
          <p><strong className="text-white/70">Application content.</strong> Whatever you provide in an
            application: your major, expected graduation year, phone number, answers to application
            questions, ranked system preferences, your resume, and any optional portfolio or
            LinkedIn profile link you choose to share. If you schedule an interview or respond to an
            offer, we record those choices and times too.</p>
          <p><strong className="text-white/70">Recruiting records.</strong> As your application moves
            through the process, staff create internal records about it — reviews, scores, notes,
            and decisions.</p>
          <p><strong className="text-white/70">Usage and technical data.</strong> We collect analytics
            about how the site is used (pages visited, actions like submitting an application or
            scheduling an interview) and technical error reports when something breaks. See
            &ldquo;Analytics&rdquo; below.</p>
          <p>
            Please don&apos;t include sensitive personal information we don&apos;t ask for — like
            government ID numbers or health information — in your application answers or uploads.
          </p>
        </Section>

        <Section title="How we use your information">
          <ul>
            <li>Reviewing and evaluating your application</li>
            <li>Scheduling interviews and trial workdays</li>
            <li>Sending you emails about your application status and next steps</li>
            <li>Coordinating recruiting decisions among LHR officers and reviewers</li>
            <li>Understanding how the site is used and fixing problems with it</li>
          </ul>
          <p>
            We do not sell your information, use it for advertising, or share it with anyone outside
            the recruiting process and the service providers listed below.
          </p>
        </Section>

        <Section title="Who can see your information">
          <p>
            Your application is visible to LHR recruiting staff — administrators, team captains,
            system leads, and reviewers — and access is scoped by role: reviewers generally see only
            applications relevant to their team and system. Internal reviews, scores, and notes are
            never shown to applicants. Other applicants cannot see your application.
          </p>
        </Section>

        <Section title="Service providers">
          <p>The site runs on third-party infrastructure that processes data on our behalf:</p>
          <ul>
            <li><strong className="text-white/70">Google Firebase</strong> — sign-in, our database, and
              file storage for resumes and portfolios (Google LLC, hosted in the United States)</li>
            <li><strong className="text-white/70">Vercel</strong> — website hosting, plus aggregate,
              cookieless web analytics and performance measurement</li>
            <li><strong className="text-white/70">PostHog</strong> — product analytics (see
              &ldquo;Analytics&rdquo; below; hosted in the United States)</li>
            <li><strong className="text-white/70">Amazon Web Services (SES)</strong> — delivery of the
              emails we send you</li>
            <li><strong className="text-white/70">Google Calendar</strong> — interview scheduling;
              calendar events include your name, email, and interview time</li>
          </ul>
          <p>
            Each provider processes data under its own security and privacy commitments. Data is
            stored in the United States.
          </p>
        </Section>

        <Section title="Analytics">
          <p>
            We use two analytics tools. Vercel Web Analytics is aggregate and cookieless — it counts
            visits without identifying you. PostHog records product events (for example
            &ldquo;application submitted&rdquo; or &ldquo;interview scheduled&rdquo;) and, once you
            sign in, associates them with your account, including your name, email, and role, so we
            can understand how applicants move through the recruiting process. PostHog stores a
            cookie or browser storage entry to recognize your browser. We do not use session
            recording — your screen is not recorded.
          </p>
        </Section>

        <Section title="Cookies and local storage">
          <ul>
            <li><strong className="text-white/70">Session cookies</strong> — keep you signed in and
              route you to the right part of the site (essential)</li>
            <li><strong className="text-white/70">Local storage</strong> — remembers your theme
              preference and caches application questions so pages load faster (functional)</li>
            <li><strong className="text-white/70">PostHog storage</strong> — recognizes your browser
              for analytics (see above)</li>
          </ul>
        </Section>

        <Section title="How long we keep your information">
          <p>
            Application materials are cycle-scoped: our practice is to delete applicant application
            data — applications, uploads, reviews, and interview records — after each recruiting
            cycle concludes. Basic account records (your name, email, and role) may be retained
            across cycles, for example if you join the organization or apply again.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can request a copy of the information we hold about you, ask us to correct it, or
            ask us to delete it by emailing{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-white/70 underline">{CONTACT_EMAIL}</a>{" "}
            from the address you signed in with. Deleting your application data during an active
            cycle withdraws your application. Status emails are part of how the recruiting process
            works — if you no longer want them, you can withdraw your application.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Access to applicant data is restricted to authenticated recruiting staff and enforced
            server-side by role. Data is transmitted over HTTPS and stored with the providers listed
            above. No system is perfectly secure, and we can&apos;t guarantee absolute security, but
            we take reasonable measures to protect your information.
          </p>
        </Section>

        <Section title="Children">
          <p>
            This site is intended for students of The University of Texas at Austin and is not
            directed at children under 13. We do not knowingly collect information from children
            under 13.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we change this policy, we will update this page and the date at the top. Significant
            changes during an active recruiting cycle will be noted on the site.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-white/70 underline">{CONTACT_EMAIL}</a>
            {" "}&middot; see also our{" "}
            <Link href="/terms" className="text-white/70 underline">Terms of Service</Link>.
          </p>
        </Section>
      </div>
    </main>
  );
}
