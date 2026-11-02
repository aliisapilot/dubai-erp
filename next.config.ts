import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
  env: {
    NEXT_PUBLIC_ERP_BUILD_ID: process.env.ERP_BUILD_ID || process.env.GITHUB_SHA || "unidentified-local-build",
  },
  // Prevent Next.js from bundling pdfjs-dist into server chunks so Node.js loads it natively
  serverExternalPackages: ["pdfjs-dist"],
  // Keep Turbopack scoped to this application. A parent-folder lockfile must
  // not change module resolution or cause noisy build warnings.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
