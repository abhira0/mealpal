import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { auth } from "@/auth";
import { GoalsEditor } from "@/app/manage/GoalsEditor";

export default async function GoalsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <>
      <PageHeader back="/manage" title="Daily goals" />

      <div className="content stack">
        <GoalsEditor />
      </div>
    </>
  );
}
