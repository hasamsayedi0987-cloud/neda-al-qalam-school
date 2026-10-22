'use client';

/**
 * تأمین‌کنندهٔ تم روشن/تاریک — با ذخیره در حافظهٔ محلی و هم‌گامی با سیستم
 */
import { ThemeProvider } from 'next-themes';
import type { ComponentProps } from 'react';

export function ThemeProviders({ children, ...props }: ComponentProps<typeof ThemeProvider>) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </ThemeProvider>
  );
}
