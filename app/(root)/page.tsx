import { redirect } from "next/navigation";
import { DEFAULT_LOCALE } from "@/lib/locales";

export default function Home() {
  redirect(`/${DEFAULT_LOCALE}/courses`);
}
