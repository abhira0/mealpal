import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");
  if (!isLoggedIn && !isLoginPage) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  // protect everything except auth/register APIs, static assets, and Next internals
  matcher: ["/((?!api/auth|api/register|_next/static|_next/image|favicon.ico).*)"],
};
