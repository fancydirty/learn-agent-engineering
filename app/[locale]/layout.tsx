import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import "katex/dist/katex.min.css";
import "@xyflow/react/dist/style.css";
import "../globals.css";
import { ThemeBoot } from "@/components/theme-boot";
import { isLocale, localeInfo } from "@/lib/locales";

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://learn.agentmentor.dev"),
  title: { default: "Agent Mentor Learn", template: "%s | Agent Mentor Learn" },
  description: "Open courses that track the Agent ecosystem. Read lessons, do exercises, and copy context straight to your Agent.",
};

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={localeInfo(locale).htmlLang} suppressHydrationWarning className={`h-full antialiased ${plexMono.variable}`}>
      <body className="min-h-full flex flex-col">
        <ThemeBoot />
        {children}
      </body>
    </html>
  );
}
