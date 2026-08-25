import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AgentM } from "@/components/AgentM";
import { CacheWarmer } from "@/components/CacheWarmer";
import { OfflineProvider } from "@/components/OfflineProvider";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portfolio Command Center",
  description: "Executive command center — JRW Portfolio, BIG Management, Badger Hotel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-gray-50 dark:bg-gray-900">
        <AnalyticsProvider>
          <Sidebar />
          <main className="flex-1 ml-64 p-8">{children}</main>
          <AgentM />
          <CacheWarmer />
          <OfflineProvider />
        </AnalyticsProvider>
      </body>
    </html>
  );
}
