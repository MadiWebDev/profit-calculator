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

    async jwt({ token, user, trigger }) {
      // On initial sign-in, copy all custom fields from the user object into the token
      if (user) {
        token.id     = user.id;
        token.teamId = (user as Record<string, unknown>).teamId as string | undefined;
        token.plan   = (user as Record<string, unknown>).plan as string;
        token.role   = (user as Record<string, unknown>).role as string;
      }

      // If teamId is missing from the token (stale JWT, Google OAuth first-login race,
      // or user registered before team-creation was added), refresh it from the DB.
      // This runs on the Node.js runtime so dynamic imports are safe.
      if (!token.teamId && token.id && trigger !== "signIn") {
        try {
          const { connectDB }   = await import("@/lib/db");
          const { default: UserModel } = await import("@/models/User");
          await connectDB();
          const dbUser = await UserModel.findById(token.id).select("teamId plan role").lean();
          if (dbUser) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const u = dbUser as any;
            if (u.teamId)  token.teamId = u.teamId.toString();
            if (u.plan)    token.plan   = u.plan;
            if (u.role)    token.role   = u.role;
          }
        } catch {
          // Non-fatal — token stays as-is; the API will return "No team" and the
          // user can sign out and back in to get a fresh token.
        }
      }

      return token;
    },

    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = session.user as any;
        u.teamId = token.teamId;
        u.plan   = token.plan;
        u.role   = token.role;
      }
      return session;
    },
  },
};
