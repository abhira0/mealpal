"use client";

import { useState } from "react";
import { DeskPage } from "@/components/DeskPage";
import { EntityList } from "@/components/EntityList";
import { IngredientDetail } from "@/components/IngredientDetail";
import { ShopDetail } from "@/components/ShopDetail";
import { ProductDetail } from "@/components/ProductDetail";
import { SlotDetail } from "@/components/SlotDetail";
import { EntityForm } from "@/components/EntityForm";
import { ENTITIES, type EntitySlug } from "@/app/manage/entities";

function Detail({ slug, id }: { slug: EntitySlug; id: string }) {
  if (slug === "ingredients") return <IngredientDetail id={id} />;
  if (slug === "shops") return <ShopDetail id={id} />;
  if (slug === "products") return <ProductDetail id={id} />;
  if (slug === "slots") return <SlotDetail id={id} />;
  return <EntityForm slug={slug} id={id} />;
}

export function DesktopManageEntity({ slug }: { slug: EntitySlug }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The route only re-renders this component with a new `slug` prop — it
  // doesn't remount — so a selection from the previous entity type would
  // otherwise stick around and get fed into <Detail> as the wrong kind of id.
  // Reset during render (not an effect) by tracking the slug this render's
  // selection belongs to.
  const [selectedSlug, setSelectedSlug] = useState(slug);
  if (slug !== selectedSlug) {
    setSelectedSlug(slug);
    setSelectedId(null);
  }

  return (
    <DeskPage title={ENTITIES[slug].label} testId="desktop-manage">
      <div className="md-layout" data-testid="md-layout">
        <div className="md-list">
          <EntityList
            slug={slug}
            bare
            onSelect={(r) => setSelectedId(String(r.id))}
            selectedId={selectedId}
          />
        </div>
        <aside className="md-pane" data-testid="md-pane">
          {selectedId ? (
            <Detail key={selectedId} slug={slug} id={selectedId} />
          ) : (
            <div className="md-pane-empty">Select an item.</div>
          )}
        </aside>
      </div>
    </DeskPage>
  );
}
