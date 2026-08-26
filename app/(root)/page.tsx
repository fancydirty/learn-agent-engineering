import { redirect } from "next/navigation";
import { scanCourseFamilies } from "@/lib/courses";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/locales";
import { coursesDir } from "@/lib/paths";

// Root redirect target: DEFAULT_LOCALE stays the preferred outward-reach landing,
// but never send visitors to a locale with zero published courses — fall back to
// the first registry locale that actually has content so "/" is never an empty page.
export default function Home() {
  const withContent = new Set(
    scanCourseFamilies(coursesDir()).flatMap((family) => family.variants.map((variant) => variant.locale)),
  );
  const target = withContent.has(DEFAULT_LOCALE)
    ? DEFAULT_LOCALE
    : (LOCALES.find((info) => withContent.has(info.code))?.code ?? DEFAULT_LOCALE);
  redirect(`/${target}/courses`);
}
