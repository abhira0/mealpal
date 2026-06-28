import { auth } from "@/auth";
import { signOut } from "@/auth";

export default async function Home() {
  const session = await auth();
  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>MealPal</h1>
      <p>Signed in as {session?.user?.email}</p>
      <p>Household ID: {session?.user?.householdId}</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
