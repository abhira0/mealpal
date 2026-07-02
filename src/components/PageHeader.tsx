import type { ReactNode } from "react";
import { BackLink } from "@/components/BackLink";

// The standard page chrome: a back link OR an eyebrow, then the title. Every
// manage/detail page uses this — reach for a bespoke <header className="chrome">
// only when the layout genuinely differs (see PlanEditor's chrome-row).
export function PageHeader({
  back,
  eyebrow,
  title,
  children,
}: {
  back?: string;
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="chrome">
      {back && <BackLink href={back} />}
      {eyebrow && <p className="eb">{eyebrow}</p>}
      <h1>{title}</h1>
      {children}
    </header>
  );
}
