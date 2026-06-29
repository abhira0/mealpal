import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PlanEditor } from "@/components/PlanEditor";

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <PlanEditor userName={session.user.name ?? session.user.email ?? null} />;
}
