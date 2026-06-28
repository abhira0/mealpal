import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EntityForm } from "@/components/EntityForm";
import { isEntitySlug } from "../../entities";

export default async function NewEntityPage({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { entity } = await params;
  if (!isEntitySlug(entity)) notFound();

  return <EntityForm slug={entity} />;
}
