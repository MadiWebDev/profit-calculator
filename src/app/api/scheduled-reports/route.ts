/**
 * Scheduled reports (PDF/CSV) and the weekly digest — CRUD.
 * Delivery runs in /api/cron/scheduled-reports (cron secret, same
 * pattern as the existing cron routes): weekly reports send on
 * Mondays, monthly on the 1st, and only when due since lastSentAt.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import ScheduledReportModel from "@/models/ScheduledReport";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  report: z.string().trim().min(1).max(100),
  format: z.enum(["csv", "pdf"]).default("csv"),
  frequency: z.enum(["weekly", "monthly"]).default("weekly"),
  channel: z.enum(["email", "whatsapp", "both"]).default("email"),
  recipient: z.string().trim().min(3).max(200),
  isDigest: z.boolean().default(false),
}).strict();

export async function GET(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "scheduled-reports-get" });
  if (authed instanceof NextResponse) return authed;
  await connectDB();
  const reports = await ScheduledReportModel.find({ teamId: toObjectId(authed.session.teamId) }).sort({ updatedAt: -1 }).lean();
  return NextResponse.json({ reports: reports.map((r) => ({ ...r, id: r._id.toString() })) });
}

export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "scheduled-reports-post" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;
  const parsed = await parseBody(req, CreateSchema);
  if ("response" in parsed) return parsed.response;
  const b = parsed.data;
  await connectDB();
  const doc = await ScheduledReportModel.create({ teamId: toObjectId(session.teamId), ...b });
  return NextResponse.json({ id: doc._id.toString() }, { status: 201 });
}
