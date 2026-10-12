import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "就活小助手 · 留学生就活助手", template: "%s · 就活小助手" },
  description: "面向在日中国留学生的 AI 就活助手：中文操作、日文产出。ES添削、选考追踪、笔试准备。",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "就活小助手", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#fbf8f3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-blobs min-h-dvh">{children}</body>
    </html>
  );
}
