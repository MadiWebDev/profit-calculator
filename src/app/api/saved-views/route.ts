/**
 * Saved views / custom dashboards — CRUD. A view is a named KPI set
 * for a role; POST /api/saved-views/:id/share creates a read-only
 * share link with an expiry (see route in [id]/share). Shared views
 * are served by /api/shared-views/:token with aggregates only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import SavedViewModel from "@/models/SavedView";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().max(50).default("all"),
  kpis: z.array(z.string().max(50)).min(1).max(20),
}).strict();

const KPI_OPTIONS = ["revenue", "netProfit", "netMargin", "orderCount", "aov", "adSpend", "roas", "refundRate", "rtoRate", "cogs"];

export async function GET(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "saved-views-get" });
  if (authed instanceof NextResponse) return authed;
  await connectDB();
  const views = await SavedViewModel.find({ teamId: toObjectId(authed.session.teamId) }).sort({ updatedAt: -1 }).lean();
  return NextResponse.json({
    views: views.map((v) => ({ ...v, id: v._id.toString() })),
    kpiOptions: KPI_OPTIONS,
  });
}

export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "saved-views-post" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;
  const parsed = await parseBody(req, CreateSchema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;
  const unknown = b.kpis.filter((k) => !KPI_OPTIONS.includes(k));
  if (unknown.length > 0) {
    return NextResponse.json({ error: `Unknown KPIs: ${unknown.join(", ")}` }, { status: 400 });
  }
  await connectDB();
  const doc = await SavedViewModel.create({
    teamId: toObjectId(session.teamId), createdBy: toObjectId(session.userId),
    name: b.name, role: b.role, kpis: b.kpis,
  });
  return NextResponse.json({ id: doc._id.toString() }, { status: 201 });
}
