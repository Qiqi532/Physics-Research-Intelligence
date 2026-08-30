import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Today Physics",
    template: "%s · Today Physics",
  },
  description: "A traceable physics research intelligence workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <footer className="site-footer">
          <p>Physics Research Intelligence</p>
          <p>公开事实 · 可追溯 AI 解读 · 确定性推荐</p>
        </footer>
      </body>
    </html>
  );
}
