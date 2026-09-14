/**
 * NextAuth v5 type augmentation.
 * Extends the built-in Session, User, and JWT types with our custom fields.
 *
 * Roles:
 *   superAdmin — internal website operator (admin panel access)
 *   owner      — paying subscriber (full workspace access)
 */
import { DefaultSession, DefaultUser } from "next-auth";
import { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      teamId: string | null;
      plan: "free" | "starter" | "growth" | "pro";
      role: "superAdmin" | "owner";
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    teamId?: string | null;
    plan?: "free" | "starter" | "growth" | "pro";
    role?: "superAdmin" | "owner";
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
