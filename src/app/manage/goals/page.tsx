import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoalsEditor } from "@/app/manage/GoalsEditor";

export default async function GoalsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <>
      <header className="chrome">
        <Link href="/manage" className="chrome-back">← Catalog</Link>
        <h1>Daily goals</h1>
      </header>

      <div className="content stack">
        <GoalsEditor />
      </div>
    </>
  );
}
