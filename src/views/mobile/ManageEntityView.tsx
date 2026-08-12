"use client";

import { EntityList } from "@/components/EntityList";
import type { EntitySlug } from "@/app/manage/entities";

export function MobileManageEntity({ slug }: { slug: EntitySlug }) {
  return (
    <div data-testid="mobile-manage">
      <EntityList slug={slug} />
    </div>
  );
}
