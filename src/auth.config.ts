import type { NextAuthConfig } from "next-auth";

// Edge-safe Auth.js config (no database / Node-only imports). Used by the
// middleware. The full config in `src/auth.ts` extends this and adds the
// Credentials provider whose `authorize` touches better-sqlite3 (Node only).
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.householdId = (user as { householdId: number }).householdId;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.householdId = token.householdId;
      return session;
    },
  },
};
