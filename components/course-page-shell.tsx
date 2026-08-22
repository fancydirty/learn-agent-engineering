import type { LocaleLink } from "@/lib/i18n";
import type { Locale } from "@/lib/locales";
import { SiteHeader } from "./site-header";

// Course page shell — single source for the header + two-column layout padding.
// Pages pass the exact same-page language links they computed from their family.
export function CoursePageShell({
  children,
  locale,
  languageLinks,
}: {
  children: React.ReactNode;
  locale: Locale;
  languageLinks: LocaleLink[];
}) {
  return (
    <>
      <SiteHeader locale={locale} languageLinks={languageLinks} />
      <div className="course-page-shell mx-auto flex w-full min-w-0 max-w-[85rem] gap-6 px-4 py-8 sm:px-6 sm:py-12 xl:gap-10">
        {children}
      </div>
    </>
  );
}
