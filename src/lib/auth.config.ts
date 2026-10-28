import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config — NO Node.js imports allowed here.
 * Used by middleware.ts which runs on the Edge Runtime.
 *
 * Only contains JWT/session callbacks and page routes.
 * Providers and DB calls live in auth.ts (Node.js runtime only).
 */
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },

  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
    newUser: "/onboarding",
  },

  providers: [], // providers are added in auth.ts

  callbacks: {
    /**
     * Controls access via the middleware.
     * Runs on Edge — must not import mongoose / bcrypt / crypto-js.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      const PROTECTED = [
        "/dashboard",
        "/onboarding",
        "/admin",
        "/api/stores",
        "/api/orders",
        "/api/products",
        "/api/sync",
        "/api/goals",
        "/api/ai-insights",
        "/api/team",
        "/api/reports",
        "/api/admin",
      ];
      const AUTH_PAGES = ["/auth/login", "/auth/register", "/auth/error", "/auth/forgot-password", "/auth/reset-password"];

      const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
      const isAuthPage  = AUTH_PAGES.some((p) => pathname.startsWith(p));
      const isAdminPage = pathname.startsWith("/admin");

      if (isProtected && !isLoggedIn) {
        const loginUrl = new URL("/auth/login", nextUrl);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return Response.redirect(loginUrl);
      }

      if (isAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // Protect admin panel — superAdmin only
      if (isAdminPage && isLoggedIn) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const role = (auth as any)?.user?.role;
        if (role !== "superAdmin") {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
      }

      return true;
    },

    /**
     * Edge-safe: pure token copy only — NO database access here.
     * The Node.js runtime (auth.ts) extends this with DB-backed refresh
     * (teamId/teamRole backfill, password-change session invalidation).
     */
    async jwt({ token, user }) {
      // On initial sign-in, copy all custom fields from the user object into the token
      if (user) {
        token.id       = user.id;
        token.teamId   = (user as Record<string, unknown>).teamId as string | undefined;
        token.plan     = (user as Record<string, unknown>).plan as string;
        token.role     = (user as Record<string, unknown>).role as string;
        token.teamRole = (user as Record<string, unknown>).teamRole as string | undefined;
        // S1: session revocation version + 2FA pending flag (see auth.ts).
        token.sessionVersion = (user as Record<string, unknown>).sessionVersion as number | undefined;
        token.twoFactorPending = (user as Record<string, unknown>).twoFactorPending as boolean | undefined;
      }
      return token;
    },

    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = session.user as any;
        u.teamId   = token.teamId;
        u.plan     = token.plan;
        u.role     = token.role;
        u.teamRole = token.teamRole;
        u.sessionVersion = token.sessionVersion;
        u.twoFactorPending = token.twoFactorPending;
      }
      return session;
    },
  },
};
