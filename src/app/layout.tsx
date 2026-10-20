import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "مکتب خصوصی نداالقلم | سیستم مدیریت مکتب",
  description:
    "سیستم جامع مدیریت مکتب خصوصی نداالقلم — ثبت نمرات، حاضری، فعالیت‌ها، کتابخانه و کارنامهٔ دیجیتال",
  keywords: ["مکتب", "نداالقلم", "مدیریت مکتب", "نمرات", "کارنامه", "حاضری"],
  authors: [{ name: "حسام الدین سیدی" }],
  manifest: "./manifest.json",
  icons: {
    icon: [
      { url: "./favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "./logo.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "./apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "نداالقلم",
  },
};

export const viewport: Viewport = {
  themeColor: "#047857",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
