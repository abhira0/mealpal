import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Responsive } from "@/components/Responsive";
import { MobileManageEntity } from "@/views/mobile/ManageEntityView";
import { DesktopManageEntity } from "@/views/desktop/ManageEntityView";
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

  return (
    <Responsive
      mobile={<MobileManageEntity slug={entity} />}
      desktop={<DesktopManageEntity slug={entity} />}
    />
  );
}
