import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: { typedRoutes: false },
  serverExternalPackages: ["postgres"],
};

export default config;
