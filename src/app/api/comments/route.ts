import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, parseQuery, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import CommentModel from "@/models/Comment";

const CreateSchema = z.object({
  targetType: z.enum(["order", "product", "campaign", "report"]),
  targetId: z.string().min(1).max(128),
  body: z.string().trim().min(1).max(4000),
  mentions: z.array(z.string().min(1).max(64)).max(20).optional().default([]),
  assignedTo: z.string().min(1).max(64).optional(),
}).strict();

const ListSchema = z.object({
  targetType: z.enum(["order", "product", "campaign", "report"]),
  targetId: z.string().min(1).max(128),
}).strict();

/** GET /api/comments — list comments for a target (team-scoped). */
export async function GET(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const q = parseQuery(req, ListSchema);
  if ("response" in q) return q.response;
  await connectDB();
  const comments = await CommentModel.find({ teamId: toObjectId(session.teamId), targetType: q.data.targetType, targetId: q.data.targetId })
    .sort({ createdAt: -1 }).limit(100).lean();
  return NextResponse.json({ comments });
}

/** POST /api/comments — add a comment/note, optionally @mentioning or assigning. */
export async function POST(req: Request) {
  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const parsed = await parseBody(req, CreateSchema);
  if ("response" in parsed) return parsed.response;
  await connectDB();
  const comment = await CommentModel.create({
    teamId: toObjectId(session.teamId),
    authorId: toObjectId(session.userId),
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    body: parsed.data.body,
    mentions: (parsed.data.mentions ?? []).filter((m) => /^[0-9a-fA-F]{24}$/.test(m)).map((m) => toObjectId(m)),
    assignedTo: parsed.data.assignedTo && /^[0-9a-fA-F]{24}$/.test(parsed.data.assignedTo) ? toObjectId(parsed.data.assignedTo) : undefined,
  });
  return NextResponse.json({ id: comment._id.toString() }, { status: 201 });
}
