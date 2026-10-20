import type { NextConfig } from "next";

/**
 * حالت عادی: سرور مستقل (standalone)
 * حالت انتشار: NEXT_OUTPUT=export + NEXT_PUBLIC_BASE_PATH برای GitHub Pages و APK
 * حالت Vercel: DEPLOY_TARGET=vercel → خروجی پیش‌فرض Next.js (Vercel خودش مدیریت می‌کند)
 */
const isExport = process.env.NEXT_OUTPUT === "export";
const isVercel = process.env.DEPLOY_TARGET === "vercel";

const nextConfig: NextConfig = {
  ...(isExport || isVercel ? {} : { output: "standalone" as const }),
  distDir: process.env.NEXT_DIST_DIR || ".next",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
