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
    // خطاهای تایپ در ساخت نادیده گرفته نمی‌شوند — کیفیت تضمین‌شده
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  // ═══ نسخهٔ ۳.۰.۰ — سپر امنیتی پاسخ‌ها (امنیت ده‌ساله) ═══
  // HSTS فقط روی HTTPS معنا دارد؛ بقیه هدرها روی همهٔ پاسخ‌ها اعمال می‌شوند
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "geolocation=(), microphone=(), payment=(), usb=()",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
        // CSP کاربردی: اسکریپت/سبک خود سایت + inline (الزام Next)؛ منابع خارجی بسته می‌شوند
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "media-src 'self' data: blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
          ].join("; "),
        },
      ],
    },
  ],
};

export default nextConfig;
