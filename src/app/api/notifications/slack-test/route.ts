import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { sendSlackNotification } from "@/lib/notify";

export async function POST(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;

  const { webhookUrl } = await req.json();
  if (!webhookUrl) return NextResponse.json({ error: "webhookUrl required" }, { status: 400 });

  try {
    await sendSlackNotification(
      webhookUrl,
      "CalcProfit connected ✅",
      "Slack notifications are working. You'll receive profit alerts here.",
      "success",
      "/dashboard"
    );
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to send test message" }, { status: 500 });
  }
}
