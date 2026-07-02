import type { ReactNode } from "react";
import Link from "next/link";
import { BackLink } from "@/components/BackLink";

export type Crumb = { label: string; href: string };

// The standard page chrome: a back icon + breadcrumb trail (parent links), then
// the title. The back icon returns to the immediate parent (last crumb). Pass
// `eyebrow` instead of crumbs for top-level pages that have no parent.
// Reach for a bespoke <header className="chrome"> only when the layout genuinely
// differs (see PlanEditor's chrome-row).
export function PageHeader({
  crumbs = [],
  eyebrow,
  title,
  children,
}: {
  crumbs?: Crumb[];
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  const parent = crumbs[crumbs.length - 1];
  return (
    <header className="chrome">
      <div className="chrome-lead">
        {parent && <BackLink href={parent.href} icon />}
        <div style={{ minWidth: 0, flex: 1 }}>
          {crumbs.length > 0 ? (
            <nav className="crumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) => (
                <span key={c.href}>
                  <Link href={c.href}>{c.label}</Link>
                  {i < crumbs.length - 1 && <span className="crumb-sep">/</span>}
                </span>
              ))}
            </nav>
          ) : (
            eyebrow && <p className="eb">{eyebrow}</p>
          )}
          <h1>{title}</h1>
        </div>
        {children}
      </div>
    </header>
  );
}
