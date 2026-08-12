import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Responsive } from "@/components/Responsive";
import { MobileToday } from "@/views/mobile/TodayView";
import { DesktopToday } from "@/views/desktop/TodayView";

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect("/login");
  const name = session.user.name ?? session.user.email ?? null;
  return <Responsive mobile={<MobileToday userName={name} />} desktop={<DesktopToday userName={name} />} />;
}
