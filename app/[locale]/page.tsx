import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locales";

// /{locale} has no page of its own — the library is the locale home.
export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/courses`);
}
