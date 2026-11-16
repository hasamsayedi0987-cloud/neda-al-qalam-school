import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProviders } from "@/components/theme-provider";

/** فونت وازیرمتن — بارگذاری خودکار با preload و بدون پرش متن */
const vazirmatn = localFont({
  src: [
    { path: "../fonts/Vazirmatn-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Vazirmatn-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Vazirmatn-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-vazir",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "مکتب خصوصی نداالقلم | سیستم مدیریت مکتب",
  description:
    "سیستم جامع مدیریت مکتب خصوصی نداالقلم — ثبت نمرات، حاضری، فعالیت‌ها، کتابخانه و کارنامهٔ دیجیتال",
  keywords: ["مکتب", "نداالقلم", "مدیریت مکتب", "نمرات", "کارنامه", "حاضری"],
  authors: [{ name: "حسام الدین سیدی" }],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "نداالقلم",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#047857" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1f1b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover", // پشتیبانی از ناچ و ناحیهٔ امن آیفون
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={`antialiased bg-background text-foreground font-sans ${vazirmatn.variable}`}>
        {/* اسپلش‌اسکرین آیفون/آیپد برای حالت نصب‌شده (PWA) — لینک‌ها به head منتقل می‌شوند */}
        {IOS_SPLASH.map(([media, href]) => (
          <link key={href} rel="apple-touch-startup-image" media={media} href={href} />
        ))}
        <ThemeProviders>
          {children}
          <Toaster />
        </ThemeProviders>
      </body>
    </html>
  );
}

/** ابعاد استاندارد اسپلش آیفون/آیپد — متناظر با فایل‌های public/splash */
const IOS_SPLASH: Array<[string, string]> = [
  ['(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)', '/splash/iphone-1290x2796.png'],
  ['(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)', '/splash/iphone-1284x2778.png'],
  ['(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)', '/splash/iphone-1179x2556.png'],
  ['(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)', '/splash/iphone-1170x2532.png'],
  ['(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)', '/splash/iphone-828x1792.png'],
  ['(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)', '/splash/iphone-750x1334.png'],
  ['(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)', '/splash/ipad-2048x2732.png'],
  ['(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)', '/splash/ipad-1668x2388.png'],
];
