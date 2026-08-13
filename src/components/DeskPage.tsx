import type { ReactNode } from "react";

/**
 * Wide desktop page shell for the bespoke desktop views. Uses `.desk-page`
 * (NOT `.content`) so it opts out of the legacy 960px cap and the :has() card
 * auto-grid that still serve the stretched-mobile pages. Renders a consistent
 * title row with optional sub-line and right-aligned actions.
 */
export function DeskPage({
  title,
  sub,
  actions,
  testId,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div className="desk-page" data-testid={testId}>
      <header className="desk-head">
        <div className="desk-head-titles">
          <h1>{title}</h1>
          {sub != null && <span className="sub">{sub}</span>}
        </div>
        {actions != null && <div className="desk-head-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
