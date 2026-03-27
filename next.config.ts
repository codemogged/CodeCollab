import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // For Electron production builds: export as static HTML files
  output: "export",
};

export default nextConfig;
