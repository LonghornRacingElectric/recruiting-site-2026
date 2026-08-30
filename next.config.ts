import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";

const nextConfig: NextConfig = {
  // Stop `next dev` from re-appending its agent-rules block to CLAUDE.md.
  agentRules: false,
};

// Source-map upload to PostHog error tracking, so production stack traces
// resolve to real files/lines instead of minified chunks. Gated on the env:
// only a build that holds a personal API key (Vercel) generates, injects and
// uploads maps — local and sandbox builds are byte-identical to before.
// POSTHOG_API_KEY: personal API key with error-tracking write scope.
// POSTHOG_PROJECT_ID: 541483 (visible in any PostHog URL; not a secret).
// Host is deliberately omitted: the upload API lives at us.posthog.com (the
// default), while NEXT_PUBLIC_POSTHOG_HOST is the ingest host — not the same.
const posthogUploadEnabled = !!process.env.POSTHOG_API_KEY && !!process.env.POSTHOG_PROJECT_ID;

export default posthogUploadEnabled
  ? withPostHogConfig(nextConfig, {
      personalApiKey: process.env.POSTHOG_API_KEY!,
      projectId: process.env.POSTHOG_PROJECT_ID!,
    })
  : nextConfig;
