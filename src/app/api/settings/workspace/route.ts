/**
 * Workspace settings — GET returns the team's WorkspaceSettings
 * (defaults when none saved yet); PATCH upserts them. One document
 * per team, always team-scoped. Covers: fiscal month start, default
 * date range, profit-definition toggles, tax/VAT mode + rates,
 * reverse charge, reporting currency, FX source + manual overrides.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import WorkspaceSettingsModel from "@/models/WorkspaceSettings";

const PatchSchema = z.object({
  fiscalMonthStartDay: z.number().int().min(1).max(28).optional(),
  defaultDateRangeDays: z.number().int().min(7).max(365).optional(),
  includeShippingRevenueInProfit: z.boolean().optional(),
  includeTaxesInProfit: z.boolean().optional(),
  includeAdSpendInProfit: z.boolean().optional(),
  taxMode: z.enum(["exclusive", "inclusive"]).optional(),
  reverseCharge: z.boolean().optional(),
  vatRates: z.array(z.object({ country: z.string().max(100), rate: z.number().min(0).max(100) })).max(100).optional(),
  reportingCurrency: z.string().length(3).optional(),
  fxSource: z.string().max(200).optional(),
  fxOverrides: z.array(z.object({ currency: z.string().length(3), rate: z.number().min(0), effectiveFrom: z.string() })).max(50).optional(),
}).strict();

export async function GET(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "workspace-settings-get" });
  if (authed instanceof NextResponse) return authed;
  await connectDB();
  const doc = await WorkspaceSettingsModel.findOne({ teamId: toObjectId(authed.session.teamId) }).lean();
  return NextResponse.json({ settings: doc ?? {
    fiscalMonthStartDay: 1, defaultDateRangeDays: 30,
    includeShippingRevenueInProfit: true, includeTaxesInProfit: false, includeAdSpendInProfit: true,
    taxMode: "exclusive", reverseCharge: false, vatRates: [], reportingCurrency: "USD",
    fxSource: "open.er-api.com", fxOverrides: [],
  } });
}

export async function PATCH(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "workspace-settings-patch" });
  if (authed instanceof NextResponse) return authed;
  const parsed = await parseBody(req, PatchSchema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;
  await connectDB();
  const update: Record<string, unknown> = { ...b };
  if (b.fxOverrides) {
    update.fxOverrides = b.fxOverrides.map((o) => ({ ...o, effectiveFrom: new Date(o.effectiveFrom) }));
  }
  const doc = await WorkspaceSettingsModel.findOneAndUpdate(
    { teamId: toObjectId(authed.session.teamId) },
    { $set: { teamId: toObjectId(authed.session.teamId), ...update } },
    { upsert: true, new: true },
  );
  return NextResponse.json({ settings: doc });
}
