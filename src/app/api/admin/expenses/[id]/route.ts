/**
 * PATCH  /api/admin/expenses/[id] — update a platform expense
 * DELETE /api/admin/expenses/[id] — delete a platform expense
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import PlatformExpenseModel, {
  type PlatformExpenseCategory,
} from "@/models/PlatformExpense";

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session.user as any).role;
  if (role !== "superAdmin") return null;
  return session;
}

const CATEGORIES: PlatformExpenseCategory[] = [
  "hosting",
  "database",
  "tools",
  "marketing",
  "other",
];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// ── PATCH /api/admin/expenses/[id] ───────────────────────────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as any;
  if (typeof b?.name === "string") {
    const name = b.name.trim();
    if (!name || name.length > 200) {
      return NextResponse.json({ error: "invalid name" }, { status: 400 });
    }
    patch.name = name;
  }
  if (b?.category !== undefined) {
    if (!CATEGORIES.includes(b.category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    patch.category = b.category;
  }
  if (b?.amount !== undefined) {
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    patch.amount = amount;
  }
  if (b?.month !== undefined) {
    if (typeof b.month !== "string" || !MONTH_RE.test(b.month)) {
      return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
    }
    patch.month = b.month;
  }
  if (b?.isRecurring !== undefined) patch.isRecurring = b.isRecurring === true;
  if (typeof b?.notes === "string") patch.notes = b.notes.trim().slice(0, 500);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  await connectDB();
  const updated = await PlatformExpenseModel.findByIdAndUpdate(id, patch, { new: true }).lean();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: updated._id.toString(),
    name: updated.name,
    category: updated.category,
    amount: updated.amount,
    month: updated.month,
    isRecurring: updated.isRecurring,
    notes: updated.notes ?? "",
    createdAt: updated.createdAt,
  });
}

// ── DELETE /api/admin/expenses/[id] ──────────────────────────────────────────
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await connectDB();
  const deleted = await PlatformExpenseModel.findByIdAndDelete(id).lean();
  if (!deleted) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
