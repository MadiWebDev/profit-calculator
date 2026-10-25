/** POST /api/saved-views/:id/share — create a read-only share link
 *  with an expiry (days, 1–90). Returns the token; the page builds
 *  the /shared/:token URL from it. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import SavedViewModel from "@/models/SavedView";
import crypto from "crypto";

const BodySchema = z.object({ days: z.number().int().min(1).max(90).default(30) }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authed = await requireAuth(req, { rateLimitKey: "saved-views-share" });
  if (authed instanceof NextResponse) return authed;
  const { id } = await params;
  const parsed = await parseBody(req, BodySchema);
  if ("response" in parsed) return parsed.response;
  await connectDB();
  const token = crypto.randomBytes(24).toString("hex");
  const view = await SavedViewModel.findOneAndUpdate(
    { _id: toObjectId(id), teamId: toObjectId(authed.session.teamId) },
    { shareToken: token, shareExpiresAt: new Date(Date.now() + parsed.data.days * 864e5) },
    { new: true },
  );
  if (!view) return NextResponse.json({ error: "Saved view not found" }, { status: 404 });
  return NextResponse.json({ token, expiresAt: view.shareExpiresAt?.toISOString() });
}
