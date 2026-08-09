import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TodayAgenda } from "@/components/TodayAgenda";

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <TodayAgenda userName={session.user.name ?? session.user.email ?? null} />;
}
