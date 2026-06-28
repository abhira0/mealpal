import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EntityList } from "@/components/EntityList";
import { isEntitySlug } from "../entities";

export default async function EntityListPage({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { entity } = await params;
  if (!isEntitySlug(entity)) notFound();

  return <EntityList slug={entity} />;
}
