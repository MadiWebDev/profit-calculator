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
      /** Personal display currency (ISO 4217) or null when never set. */
      displayCurrency?: string | null;
      /** Personal display timezone (IANA) or null when never set. Locked once set. */
      timezone?: string | null;
      /** True once the onboarding modal has been completed. */
      onboardingCompleted?: boolean;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    teamId?: string | null;
    plan?: "free" | "starter" | "growth" | "pro";
    role?: "superAdmin" | "owner";
    displayCurrency?: string | null;
    timezone?: string | null;
    onboardingCompleted?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    teamId?: string | null;
    plan?: string;
    role?: string;
    displayCurrency?: string | null;
    timezone?: string | null;
    onboardingCompleted?: boolean;
  }
}
