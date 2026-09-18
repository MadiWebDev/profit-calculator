import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPriceId, paddleCreateCheckout } from "@/lib/billing";
import type { BillingInterval, PlanKey } from "@/lib/billing";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";

const VALID_PLANS: PlanKey[]         = ["starter", "growth", "pro"];
const VALID_INTERVALS: BillingInterval[] = ["monthly", "quarterly", "semiannual", "annual"];

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const plan: PlanKey         = body.plan;
    const interval: BillingInterval = body.interval ?? "monthly";

    if (!VALID_PLANS.includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    if (!VALID_INTERVALS.includes(interval)) {
      return NextResponse.json({ error: "Invalid billing interval" }, { status: 400 });
    }

    await connectDB();
    const user = await UserModel.findOne({ email: session.user.email });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const teamId  = (session.user as { teamId?: string }).teamId ?? "";
    const priceId = getPriceId(plan, interval);

    if (!priceId) {
      return NextResponse.json(
        { error: `Paddle price not configured for ${plan}/${interval}. Please set NEXT_PUBLIC_PADDLE_${plan.toUpperCase()}_${interval.toUpperCase()}_PRICE_ID.` },
        { status: 500 }
      );
    }

    const base       = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const successUrl = `${base}/dashboard/settings?upgraded=1`;

    const result = await paddleCreateCheckout({
      priceId,
      customerEmail: user.email,
      teamId,
      successUrl,
    });

    // Paddle returns the hosted checkout URL inside data.checkout.url
    const checkoutUrl: string =
      result?.data?.checkout?.url ??
      result?.data?.url ??
      successUrl;

    return NextResponse.json({ url: checkoutUrl });
  } catch (err) {
    console.error("[checkout] error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
