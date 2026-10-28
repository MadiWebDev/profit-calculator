import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { authConfig } from "@/lib/auth.config";

/**
 * Full auth config — Node.js runtime only.
 * Extends the edge-safe authConfig with providers that use bcrypt and mongoose.
 * DO NOT import this file from middleware.ts.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  providers: [
    // Google sign-in (F13) — enabled only when both env vars are configured.
    // Account linking is by verified email only (see signIn callback below).
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Request the verified email; linking below requires it
            authorization: { params: { scope: "openid email profile" } },
          }),
        ]
      : []),

    Credentials({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        await connectDB();
        const user = await UserModel.findOne({
          email: (credentials.email as string).toLowerCase().trim(),
        }).select("+password +failedLoginAttempts +lockoutUntil");

        if (!user || !user.password) return null;

        // Temporary lockout after repeated failures
        if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
          return null;
        }

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!valid) {
          // Throttle: 5 failures → 15-minute lockout (non-blocking update)
          const attempts = (user.failedLoginAttempts ?? 0) + 1;
          const update: Record<string, unknown> = { failedLoginAttempts: attempts };
          if (attempts >= 5) {
            update.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
            update.failedLoginAttempts = 0; // reset counter when lockout starts
          }
          await UserModel.findByIdAndUpdate(user._id, update).exec();
          return null;
        }

        // Success — clear any throttle state
        if (user.failedLoginAttempts || user.lockoutUntil) {
          await UserModel.findByIdAndUpdate(user._id, {
            failedLoginAttempts: 0,
            $unset: { lockoutUntil: "" },
          }).exec();
        }

        // Email verification gate — checked AFTER password validation so an
        // attacker can't probe which addresses are registered-but-unverified.
        // In development, skip the gate so you can log in without email setup.
        if (!user.emailVerified && process.env.NODE_ENV !== "development") {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        // Resolve the team-level role for permission checks
        let teamRole: string | undefined;
        if (user.teamId) {
          const { default: TeamModel } = await import("@/models/Team");
          const team = await TeamModel.findById(user.teamId)
            .select("members.userId members.role members.status")
            .lean();
          const member = team?.members?.find(
            (m: { userId?: unknown; status?: string }) =>
              m.userId?.toString() === user._id.toString() && m.status === "active"
          ) as { role?: string } | undefined;
          teamRole = member?.role;
        }

        return {
          id:     user._id.toString(),
          email:  user.email,
          name:   user.name,
          image:  user.image,
          teamId: user.teamId?.toString(),
          plan:   user.plan,
          role:   user.platformRole ?? (user.role === "superAdmin" ? "superAdmin" : "user"),
          teamRole,
          // S1: session revocation + 2FA. twoFactorPending is cleared by
          // the 2FA verify step (session update); requireAuth rejects
          // pending sessions for all API routes.
          sessionVersion: user.sessionVersion ?? 0,
          twoFactorPending: !!user.twoFactorEnabled,
        };
      },
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,

    /**
     * Node.js runtime only — extends the edge-safe base jwt() from
     * auth.config.ts with DB-backed refresh. Never runs on Edge.
     */
    async jwt(args) {
      // S1: session update() from the 2FA verify page clears the pending
      // flag after a verified code — honour it here, and nowhere else.
      if (args.trigger === "update" && (args.session as { user?: { twoFactorPending?: boolean } } | undefined)?.user?.twoFactorPending === false) {
        const base0 = authConfig.callbacks?.jwt;
        const tok0 = base0 ? await base0(args) : args.token;
        if (tok0) tok0.twoFactorPending = false;
        return tok0;
      }
      // Edge-safe base: copies user fields into the token on sign-in
      const base = authConfig.callbacks?.jwt;
      const token = base ? await base(args) : args.token;
      if (!token) return token;
      const { trigger } = args;

      // Backfill teamId / teamRole when missing (stale JWT, Google OAuth
      // first-login race, or pre-team-creation accounts). The team-level
      // role is refreshed alongside so permission checks stay current.
      if (token.id && trigger !== "signIn" && (!token.teamId || !token.teamRole)) {
        try {
          await connectDB();
          const dbUser = await UserModel.findById(token.id)
            .select("teamId plan platformRole role")
            .lean() as {
              teamId?: unknown; plan?: string; platformRole?: string; role?: string;
            } | null;
          if (dbUser) {
            if (dbUser.teamId) token.teamId = String(dbUser.teamId);
            if (dbUser.plan)   token.plan   = dbUser.plan;
            // platformRole is the source of truth; fall back to legacy role
            token.role = dbUser.platformRole ?? (dbUser.role === "superAdmin" ? "superAdmin" : "user");

            const { default: TeamModel } = await import("@/models/Team");
            const team = await TeamModel.findById(dbUser.teamId)
              .select("members.userId members.role members.status")
              .lean() as {
                members?: { userId?: unknown; role?: string; status?: string }[];
              } | null;
            const member = team?.members?.find(
              (m) => m.userId?.toString() === String(token.id) && m.status === "active"
            );
            if (member?.role) token.teamRole = member.role;
          }
        } catch {
          // Non-fatal — token stays as-is; the user can sign out and back in.
        }
      }

      // Session invalidation on password change AND on sessionVersion
      // bump (revoke-all, S1.2): if either happened after this token was
      // issued, drop the session (forces re-login). Checked at most once
      // every 5 minutes per session to bound DB load.
      const nowSec = Math.floor(Date.now() / 1000);
      const lastCheck = typeof token.lastPwdCheck === "number" ? token.lastPwdCheck : 0;
      if (token.id && token.iat && nowSec - lastCheck > 300) {
        try {
          await connectDB();
          const dbUser = await UserModel.findById(token.id)
            .select("passwordChangedAt sessionVersion")
            .lean() as { passwordChangedAt?: Date; sessionVersion?: number } | null;
          token.lastPwdCheck = nowSec;
          const pwdChangedAt = dbUser?.passwordChangedAt;
          if (pwdChangedAt && token.iat * 1000 < new Date(pwdChangedAt).getTime() - 5000) {
            return null; // password changed since issue → session invalid
          }
          if (
            typeof dbUser?.sessionVersion === "number" &&
            typeof token.sessionVersion === "number" &&
            dbUser.sessionVersion !== token.sessionVersion
          ) {
            return null; // sessions revoked since issue → session invalid
          }
        } catch {
          // Non-fatal — keep the session on DB errors
        }
      }

      return token;
    },

    async signIn({ user, account, profile }) {
      // Handle Google OAuth — create user on first sign-in.
      // Account linking is by VERIFIED email only: if Google hasn't verified
      // the email, we refuse to link/create (prevents account takeover via
      // unverified emails).
      if (account?.provider === "google" && user.email) {
        const emailVerified =
          (profile as { email_verified?: boolean } | undefined)?.email_verified === true;
        if (!emailVerified) return false;

        await connectDB();
        const existing = await UserModel.findOne({ email: user.email.toLowerCase() });
        if (!existing) {
          const newUser = await UserModel.create({
            name:               user.name ?? "User",
            email:              user.email,
            image:              user.image,
            emailVerified:      new Date(),
            onboardingCompleted: false,
            plan:               "free",
            role:               "owner",
            trialEndsAt:        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          });

          // Create personal team for Google OAuth users
          const { default: TeamModel } = await import("@/models/Team");
          const slug =
            (user.name ?? "user")
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "-")
              .replace(/-+/g, "-")
              .slice(0, 40) +
            "-" +
            Math.random().toString(36).slice(2, 6);
          const team = await TeamModel.create({
            name:      `${user.name ?? "User"}'s Workspace`,
            slug,
            ownerId:   newUser._id,
            members:   [{ userId: newUser._id, role: "owner", status: "active", invitedAt: new Date() }],
            plan:      "free",
          trialEndsAt: newUser.trialEndsAt,
          });
          await UserModel.findByIdAndUpdate(newUser._id, { teamId: team._id });
        }
      }
      return true;
    },
  },
});

export { auth as getServerSession };
