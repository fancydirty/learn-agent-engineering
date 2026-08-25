import type { ReactNode } from "react";

export function InteractiveCardShell({
  eyebrow,
  title,
  anchorId,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  anchorId?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside id={anchorId} className="interactive-card" aria-label={title}>
      <div className="interactive-card-head">
        <div>
          <div className="interactive-card-eyebrow">{eyebrow}</div>
          <h3>{title}</h3>
        </div>
        {actions}
      </div>
      {children}
    </aside>
  );
}

