import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import ProductModel from "@/models/Product";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id?: string; teamId?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const { id } = await params;
  const body = await req.json();

  await connectDB();
  const product = await ProductModel.findOne({ _id: id, teamId: user.teamId });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowedFields: (keyof typeof body)[] = ["defaultCogs", "name", "sku"];
  for (const field of allowedFields) {
    if (body[field] !== undefined) product.set(field, body[field]);
  }
  await product.save();

  await logAudit({
    teamId: new mongoose.Types.ObjectId(user.teamId),
    userId: new mongoose.Types.ObjectId(user.id!),
    action: "product.cogs_updated",
    description: `Updated product "${product.name}" COGS to $${body.defaultCogs ?? product.defaultCogs}`,
    resourceType: "Product",
    resourceId: id,
  });

  return NextResponse.json({ success: true });
}
