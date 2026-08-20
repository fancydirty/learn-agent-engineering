import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { ThemeBoot } from "@/components/theme-boot";
import { scanCourses } from "@/lib/courses";
import { coursesDir } from "@/lib/paths";

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://learn.agentmentor.dev"),
  title: { default: "Agent Mentor Learn", template: "%s | Agent Mentor Learn" },
  description: "紧跟 Agent 生态变化的开源课程。读课程、做练习，把上下文直接复制给你的 Agent。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const courseLanguages = Object.fromEntries(
    scanCourses(coursesDir()).map((course) => [course.slug, course.lang]),
  );

  return (
    <html lang="zh-CN" suppressHydrationWarning className={`h-full antialiased ${plexMono.variable}`}>
      <body className="min-h-full flex flex-col">
        <ThemeBoot />
        <SiteHeader courseLanguages={courseLanguages} />
        {children}
      </body>
    </html>
  );
}
