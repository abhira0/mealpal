import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PlanEditor } from "@/components/PlanEditor";

export default async function PlanPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <PlanEditor />;
}
