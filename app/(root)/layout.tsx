import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://learn.agentmentor.dev"),
  title: { default: "Agent Mentor Learn", template: "%s | Agent Mentor Learn" },
};

// Root layout for the bare "/" route only — it exists to redirect into the
// default locale. Real chrome lives in app/[locale]/layout.tsx.
export default function RootRedirectLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
