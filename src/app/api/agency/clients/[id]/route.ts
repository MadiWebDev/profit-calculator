import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import ClientWorkspaceModel from "@/models/ClientWorkspace";
import StoreModel from "@/models/Store";

const PatchSchema = z.object({
  storeIds: z.array(z.string().min(1)).max(100),
}).strict();

/**
 * PATCH /api/agency/clients/[id] — link stores to a client workspace so
 * the read-only portal (/portal/[token]) shows them. Only stores owned
 * by the agency team can be linked, and only to that team's own clients.
 * Unknown or foreign store ids are rejected, not silently dropped.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(req, { permission: "manage:team" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const { id } = await params;
  const parsed = await parseBody(req, PatchSchema);
  if ("response" in parsed) return parsed.response;
  await connectDB();

  const client = await ClientWorkspaceModel.findOne({
    _id: toObjectId(id),
    agencyTeamId: toObjectId(session.teamId),
  });
  if (!client) return NextResponse.json({ error: "Client workspace not found" }, { status: 404 });

  const storeObjectIds = parsed.data.storeIds.map((s) => toObjectId(s));
  const owned = await StoreModel.find({
    _id: { $in: storeObjectIds },
    teamId: toObjectId(session.teamId),
  }).select("_id").lean();
  if (owned.length !== storeObjectIds.length) {
    return NextResponse.json({ error: "One or more stores do not belong to your team" }, { status: 400 });
  }
  client.storeIds = storeObjectIds;
  await client.save();
  return NextResponse.json({ id: client._id.toString(), storeIds: parsed.data.storeIds });
}
