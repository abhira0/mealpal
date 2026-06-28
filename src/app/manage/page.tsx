import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ManageForms } from "@/components/ManageForms";

export default async function ManagePage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <ManageForms />;
}
