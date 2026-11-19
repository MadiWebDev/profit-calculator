/**
 * GET /api/admin/campaigns/stats — Overview KPIs + Analytics series for
 * the Campaign Center (Phase 3). Every number comes from real records
 * (see getCampaignCenterStats in src/lib/campaign-stats-db.ts). Rates are
 * null when their denominator is zero — the UI renders those as
 * "Tracking unavailable", never as 0%.
 *
 * Query: ?range=today|7d|30d|90d|this-month|last-month|custom|all
 * (default 30d) &from=YYYY-MM-DD &to=YYYY-MM-DD (custom only, max 366
 * days) &channel=all|email|whatsapp (default all).
 */
import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";
import {
  resolveDateRange,
  type CampaignDateRangeKey,
} from "@/lib/campaign-stats";
import { getCampaignCenterStats } from "@/lib/campaign-stats-db";

const RANGES: CampaignDateRangeKey[] = [
  "today",
  "7d",
  "30d",
  "90d",
  "this-month",
  "last-month",
  "custom",
  "all",
];

export async function GET(req: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminId = (session.user as any)?.id as string;
  const rl = await withRateLimit(req, "standard", `campaign-stats:${adminId}`);
  if (rl) return rl;

  const { searchParams } = new URL(req.url);
  const rangeKey = (searchParams.get("range") ?? "30d") as CampaignDateRangeKey;
  if (!RANGES.includes(rangeKey)) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }
  const channelParam = searchParams.get("channel") ?? "all";
  if (!["all", "email", "whatsapp"].includes(channelParam)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }
  const channel = channelParam === "all" ? null : (channelParam as "email" | "whatsapp");

  const now = new Date();
  const range = resolveDateRange(
    rangeKey,
    now,
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined
  );
  if (rangeKey === "custom") {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (
      !fromDate ||
      !toDate ||
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime()) ||
      fromDate > toDate ||
      (toDate.getTime() - fromDate.getTime()) / 86400000 > 366
    ) {
      return NextResponse.json(
        { error: "Custom range needs valid from/to dates (max 366 days)" },
        { status: 400 }
      );
    }
  }

  const stats = await getCampaignCenterStats({ range, channel });

  return NextResponse.json({
    range: rangeKey,
    from: range?.from.toISOString() ?? null,
    to: range?.to.toISOString() ?? null,
    channel: channelParam,
    ...stats,
  });
}
