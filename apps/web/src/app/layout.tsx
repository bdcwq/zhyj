import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="zh-CN">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
