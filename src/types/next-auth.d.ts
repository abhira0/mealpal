import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      householdId: number;
      email?: string | null;
      name?: string | null;
    };
  }
  interface User {
    householdId: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    householdId: number;
  }
}
