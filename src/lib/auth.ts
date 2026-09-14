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
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),

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
        }).select("+password");

        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!valid) return null;

        return {
          id:     user._id.toString(),
          email:  user.email,
          name:   user.name,
          image:  user.image,
          teamId: user.teamId?.toString(),
          plan:   user.plan,
          role:   user.role,
        };
      },
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, account }) {
      // Handle Google OAuth — create user on first sign-in
      if (account?.provider === "google" && user.email) {
        await connectDB();
        const existing = await UserModel.findOne({ email: user.email });
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
