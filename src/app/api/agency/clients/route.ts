import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import ClientWorkspaceModel from "@/models/ClientWorkspace";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  clientEmail: z.string().email().optional(),
  brandLogoUrl: z.string().url().max(500).optional(),
  brandColor: z.string().max(20).optional(),
  brandDomain: z.string().max(200).optional(),
  portalDays: z.number().int().min(1).max(365).optional().default(90),
}).strict();

/** GET /api/agency/clients — list the agency team's client workspaces. */
export async function GET(req: Request) {
  const result = await requireAuth(req, { permission: "manage:team" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  await connectDB();
  const clients = await ClientWorkspaceModel.find({ agencyTeamId: toObjectId(session.teamId) })
    .select("-portalTokenHash").sort({ createdAt: -1 }).lean();
  return NextResponse.json({ clients });
}

/**
 * POST /api/agency/clients — create a client workspace with a shareable
 * read-only portal link (token returned ONCE; only its SHA-256 hash is
 * stored, with an expiry). Portal rendering itself is a follow-up page
 * that resolves the token hash — the link format is /portal/[token].
 */
export async function POST(req: Request) {
  const result = await requireAuth(req, { permission: "manage:team" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const parsed = await parseBody(req, CreateSchema);
  if ("response" in parsed) return parsed.response;
  await connectDB();
  const token = randomBytes(24).toString("hex");
  const client = await ClientWorkspaceModel.create({
    agencyTeamId: toObjectId(session.teamId),
    name: parsed.data.name,
    clientEmail: parsed.data.clientEmail,
    brandLogoUrl: parsed.data.brandLogoUrl,
    brandColor: parsed.data.brandColor,
    brandDomain: parsed.data.brandDomain,
    portalTokenHash: createHash("sha256").update(token).digest("hex"),
    portalExpiresAt: new Date(Date.now() + parsed.data.portalDays * 24 * 60 * 60 * 1000),
    permissions: ["read:reports"],
  });
  return NextResponse.json({ id: client._id.toString(), portalToken: token, portalUrl: `/portal/${token}` }, { status: 201 });
}
