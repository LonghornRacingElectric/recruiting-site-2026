import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stop `next dev` from re-appending its agent-rules block to CLAUDE.md.
  agentRules: false,
};

export default nextConfig;
