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
const posthogKey = process.env.POSTHOG_API_KEY;
const posthogProjectId = process.env.POSTHOG_PROJECT_ID;

if ((posthogKey || posthogProjectId) && !(posthogKey && posthogProjectId)) {
  // half-configured is the likely first-deploy mistake; make it visible in
  // the build log instead of silently shipping minified traces for weeks
  console.warn(
    `PostHog source maps OFF: only ${posthogKey ? "POSTHOG_API_KEY" : "POSTHOG_PROJECT_ID"} is set — both are required.`
  );
}

export default posthogKey && posthogProjectId
  ? withPostHogConfig(nextConfig, {
      personalApiKey: posthogKey,
      projectId: posthogProjectId,
    })
  : nextConfig;
