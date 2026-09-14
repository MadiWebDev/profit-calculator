import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import TeamModel from "@/models/Team";
import { sendWelcomeEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    await connectDB();

    const exists = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);

    // Create user
    const user = await UserModel.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      plan: "free",
      role: "owner",
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      onboardingCompleted: false,
    });

    // Create their personal team/workspace
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40)
      + "-" + Math.random().toString(36).slice(2, 6);
    const team = await TeamModel.create({
      name: `${name.trim()}'s Workspace`,
      slug,
      ownerId: user._id,
      members: [{ userId: user._id, role: "owner", status: "active", invitedAt: new Date() }],
      plan: "free",
      trialEndsAt: user.trialEndsAt,
    });

    // Link team to user
    await UserModel.findByIdAndUpdate(user._id, { teamId: team._id });

    // Fire welcome email (non-blocking)
    sendWelcomeEmail(user.email, user.name).catch(console.error);

    return NextResponse.json({ success: true, userId: user._id.toString() }, { status: 201 });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
