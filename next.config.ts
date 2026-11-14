import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  agentRules: false,
  ...(process.env.VINYL_DESKTOP_BUILD === "1" ? {
    output: "standalone" as const,
    distDir: ".next-desktop",
    typescript: { tsconfigPath: "tsconfig.desktop.json" },
  } : {}),
};

export default nextConfig;
