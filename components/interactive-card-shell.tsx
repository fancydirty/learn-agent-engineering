import type { ReactNode } from "react";

export function InteractiveCardShell({
  eyebrow,
  title,
  anchorId,
  children,
}: {
  eyebrow: string;
  title: string;
  anchorId?: string;
  children: ReactNode;
}) {
  return (
    <aside id={anchorId} className="interactive-card" aria-label={title}>
      <div className="interactive-card-eyebrow">{eyebrow}</div>
      <h3>{title}</h3>
      {children}
    </aside>
  );
}
