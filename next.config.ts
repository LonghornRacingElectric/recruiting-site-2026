import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stop `next dev` from re-appending its agent-rules block to CLAUDE.md.
  // @ts-expect-error agentRules is a Next.js CLI option not present in NextConfig type
  agentRules: false,
};

export default nextConfig;
