import type { Metadata } from "next";
import { Inter_Tight, Inter } from "next/font/google";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-display",
  display: "swap",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-body",
  display: "swap",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "社区健康管理系统",
  description: "精卫识仪社区基层健康管理平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${interTight.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
