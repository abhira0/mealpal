import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { findUserByEmail } from "@/lib/users";
import { verifyPassword } from "@/lib/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = creds?.email as string | undefined;
        const password = creds?.password as string | undefined;
        if (!email || !password) return null;
        const user = await findUserByEmail(db, email);
        if (!user) return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;
        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          householdId: user.householdId,
        };
      },
    }),
  ],
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
});
