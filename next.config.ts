import type { NextConfig } from "next";

/**
 * حالت عادی: سرور مستقل (standalone)
 * حالت انتشار: NEXT_OUTPUT=export + NEXT_PUBLIC_BASE_PATH برای GitHub Pages و APK
 */
const isExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  ...(isExport
    ? { output: "export" as const }
    : { output: "standalone" as const }),
  distDir: process.env.NEXT_DIST_DIR || ".next",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
