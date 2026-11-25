import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
  env: {
    NEXT_PUBLIC_ERP_BUILD_ID:
      process.env.ERP_BUILD_ID ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      "unidentified-local-build",
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || "",
    NEXT_PUBLIC_VERCEL_GIT_REF: process.env.VERCEL_GIT_COMMIT_REF || "",
  },
  // Prevent Next.js from bundling pdfjs-dist, Chromium binaries, or puppeteer-core into server chunks
  serverExternalPackages: ["pdfjs-dist", "@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/pdf/render": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
      "./node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2",
      "./node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2",
      "./node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2",
      "./node_modules/@fontsource/inter/files/inter-latin-800-normal.woff2",
      "./node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2",
      "./node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-500-normal.woff2",
      "./node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-600-normal.woff2",
      "./node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff2",
      "./node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-800-normal.woff2",
      "./public/company-assets/**",
    ],
  },
  // Keep Turbopack scoped to this application. A parent-folder lockfile must
  // not change module resolution or cause noisy build warnings.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
