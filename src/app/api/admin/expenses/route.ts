/**
 * GET  /api/admin/expenses?month=YYYY-MM — list platform expenses for a month
 * POST /api/admin/expenses             — record a platform expense
 *
 * Platform expenses are the superAdmin's own record of what running
 * GetProfitCalc costs (hosting, database, tools, ...). They are what
 * make the admin profit number real instead of fee-only.
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

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateBody(body: any): { ok: true; value: {
  name: string;
  category: PlatformExpenseCategory;
  amount: number;
  month: string;
  isRecurring: boolean;
  notes?: string;
}} | { ok: false; error: string } {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };
  if (name.length > 200) return { ok: false, error: "name is too long" };
  const category = body?.category ?? "other";
  if (!CATEGORIES.includes(category)) return { ok: false, error: "invalid category" };
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount must be a positive number" };
  }
  const month = typeof body?.month === "string" ? body.month : currentMonthKey();
  if (!MONTH_RE.test(month)) return { ok: false, error: "month must be YYYY-MM" };
  const isRecurring = body?.isRecurring === true;
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : undefined;
  return { ok: true, value: { name, category, amount, month, isRecurring, notes } };
}

// ── GET /api/admin/expenses ──────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") ?? currentMonthKey();
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  await connectDB();
  const expenses = await PlatformExpenseModel.find({ month })
    .sort({ createdAt: -1 })
    .lean();
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  return NextResponse.json({
    month,
    total: Math.round(total * 100) / 100,
    expenses: expenses.map((e) => ({
      id: e._id.toString(),
      name: e.name,
      category: e.category,
      amount: e.amount,
      month: e.month,
      isRecurring: e.isRecurring,
      notes: e.notes ?? "",
      createdAt: e.createdAt,
    })),
  });
}

// ── POST /api/admin/expenses ─────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const checked = validateBody(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  await connectDB();
  const created = await PlatformExpenseModel.create(checked.value);
  return NextResponse.json(
    {
      id: created._id.toString(),
      name: created.name,
      category: created.category,
      amount: created.amount,
      month: created.month,
      isRecurring: created.isRecurring,
      notes: created.notes ?? "",
      createdAt: created.createdAt,
    },
    { status: 201 },
  );
}
