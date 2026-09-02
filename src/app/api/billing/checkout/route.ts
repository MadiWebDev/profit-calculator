import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGateway, getPriceId, dodoCreateCheckout, paddleCreateCheckout } from "@/lib/billing";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { plan, interval = "monthly" } = await req.json();
    if (!["starter", "growth", "pro"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    await connectDB();
    const user = await UserModel.findOne({ email: session.user.email });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const teamId = (session.user as { teamId?: string }).teamId ?? "";
    const priceId = getPriceId(plan, interval);
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const successUrl = `${base}/dashboard/settings?upgraded=1`;
    const cancelUrl = `${base}/pricing`;
    const gateway = getGateway();

    let checkoutUrl: string;

    if (gateway === "dodo") {
      const result = await dodoCreateCheckout({
        priceId,
        customerEmail: user.email,
        customerName: user.name,
        teamId,
        successUrl,
        cancelUrl,
      });
      checkoutUrl = result.url ?? result.checkout_url ?? successUrl;
    } else {
      const result = await paddleCreateCheckout({
        priceId,
        customerEmail: user.email,
        teamId,
        successUrl,
      });
      checkoutUrl = result.data?.checkout?.url ?? successUrl;
    }

    return NextResponse.json({ url: checkoutUrl });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
