import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EntityForm } from "@/components/EntityForm";
import { IngredientDetail } from "@/components/IngredientDetail";
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

  // Ingredients get a rich detail/hub view; everything else is the plain form.
  if (entity === "ingredients") return <IngredientDetail id={id} />;

  return <EntityForm slug={entity} id={id} />;
}
