import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import "@xyflow/react/dist/style.css";
import "../globals.css";
import { ThemeBoot } from "@/components/theme-boot";
import { isLocale, localeInfo } from "@/lib/locales";
import { GoogleAnalytics } from "@/components/analytics";
import { OrganizationStructuredData, WebSiteStructuredData } from "@/components/structured-data";
import { defaultMetadata } from "@/lib/seo";

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = defaultMetadata;

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang={localeInfo(locale).htmlLang} suppressHydrationWarning className={`h-full antialiased ${plexMono.variable}`}>
      <head>
        {gaId && <GoogleAnalytics gaId={gaId} />}
        <OrganizationStructuredData />
        <WebSiteStructuredData />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeBoot />
        {children}
      </body>
    </html>
  );
}
