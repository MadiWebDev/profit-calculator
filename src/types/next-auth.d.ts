/**
 * NextAuth v5 type augmentation.
 * Extends the built-in Session, User, and JWT types with our custom fields
 * so we never need `(session.user as { teamId?: string })` casts anywhere.
 */
import { DefaultSession, DefaultUser } from "next-auth";
import { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      teamId: string | null;
      plan: "free" | "starter" | "growth" | "pro";
      role: "owner" | "admin" | "member" | "viewer";
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    teamId?: string | null;
    plan?: "free" | "starter" | "growth" | "pro";
    role?: "owner" | "admin" | "member" | "viewer";
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    teamId?: string | null;
    plan?: string;
    role?: string;
  }
}
