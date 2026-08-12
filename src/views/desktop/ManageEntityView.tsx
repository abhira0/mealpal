"use client";

import { useState } from "react";
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

  return (
    <div data-testid="desktop-manage">
      <header className="chrome">
        <h1>{ENTITIES[slug].label}</h1>
      </header>
      <div className="content">
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
      </div>
    </div>
  );
}
