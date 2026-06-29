import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EntityForm } from "@/components/EntityForm";
import { IngredientDetail } from "@/components/IngredientDetail";
import { ShopDetail } from "@/components/ShopDetail";
import { ProductDetail } from "@/components/ProductDetail";
import { SlotDetail } from "@/components/SlotDetail";
import { ENTITIES, isEntitySlug } from "../../entities";

export default async function EditEntityPage({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { entity, id } = await params;
  // "new" is handled by a sibling route; never treat it as an id here.
  if (!isEntitySlug(entity) || id === "new") notFound();
  // Entities without edit (prices) have no edit page.
  if (!ENTITIES[entity].canEdit) notFound();

  // Every entity gets a read-only detail view; Edit opens the form in a sheet.
  if (entity === "ingredients") return <IngredientDetail id={id} />;
  if (entity === "shops") return <ShopDetail id={id} />;
  if (entity === "products") return <ProductDetail id={id} />;
  if (entity === "slots") return <SlotDetail id={id} />;

  // Fallback for any future entity without a bespoke detail view.
  return <EntityForm slug={entity} id={id} />;
}
