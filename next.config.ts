import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.VINYL_DESKTOP_BUILD === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
