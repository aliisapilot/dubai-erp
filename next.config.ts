import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Keep Turbopack scoped to this application. A parent-folder lockfile must
  // not change module resolution or cause noisy build warnings.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
