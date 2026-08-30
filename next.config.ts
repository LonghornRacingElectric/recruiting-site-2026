import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";

const nextConfig: NextConfig = {
  // Stop `next dev` from re-appending its agent-rules block to CLAUDE.md.
  agentRules: false,
};

// Source-map upload to PostHog error tracking, so production stack traces
// resolve to real files/lines instead of minified chunks.
//
// Gated on the env: without both vars the exported config is the plain object
// above and the build is byte-identical to before. Only Vercel production
// builds carry the vars.
//   POSTHOG_API_KEY    personal API key with error-tracking write scope
//   POSTHOG_PROJECT_ID 541483 (visible in any PostHog URL; not a secret)
// `host` is deliberately omitted: the CLI defaults to https://us.i.posthog.com,
// which is correct for our US cloud project — do not "fix" this by passing
// NEXT_PUBLIC_POSTHOG_HOST; overriding the default can break a working upload.
//
// NOTE: with the vars set, a failed upload FAILS THE BUILD (bad/rotated key,
// PostHog outage). Loud by design — a silent fallback would leave traces
// minified forever without anyone noticing. 2am escape hatch: unset
// POSTHOG_API_KEY in Vercel and redeploy; the build then skips uploads.
// Trimmed: a stray space in a Vercel paste would otherwise pass the gate and
// hard-fail every deploy at the CLI (the package trims the key but not the id).
const posthogKey = process.env.POSTHOG_API_KEY?.trim() || undefined;
const posthogProjectId = process.env.POSTHOG_PROJECT_ID?.trim() || undefined;
// Environment-aware: `vercel env pull` puts these keys in developers'
// .env.local, and a laptop build must neither upload junk symbol sets into
// the production project nor die on a scope-less key. Uploads happen only on
// Vercel production builds — or when forced explicitly for a local test.
const isProductionBuild = process.env.VERCEL_ENV === "production" || process.env.POSTHOG_FORCE_SOURCEMAPS === "1";
const uploadsOn = !!(posthogKey && posthogProjectId && isProductionBuild);

if (!uploadsOn) {
  if (process.env.VERCEL_ENV === "production" && !(posthogKey && posthogProjectId)) {
    // the likeliest failure: rollout step never done, or the key rotated out —
    // exactly the silent-minified-traces-for-weeks outcome this exists to stop
    console.warn(
      `PostHog source maps OFF on a production build: ${!posthogKey && !posthogProjectId ? "POSTHOG_API_KEY and POSTHOG_PROJECT_ID are not set" : `only ${posthogKey ? "POSTHOG_API_KEY" : "POSTHOG_PROJECT_ID"} is set — both are required`}.`
    );
  } else if ((posthogKey || posthogProjectId) && !(posthogKey && posthogProjectId)) {
    console.warn(
      `PostHog source maps OFF: only ${posthogKey ? "POSTHOG_API_KEY" : "POSTHOG_PROJECT_ID"} is set — both are required.`
    );
  }
}

export default uploadsOn
  ? withPostHogConfig(nextConfig, {
      personalApiKey: posthogKey!,
      projectId: posthogProjectId!,
    })
  : nextConfig;
