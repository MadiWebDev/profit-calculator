import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import TeamModel from "@/models/Team";
import SubscriptionModel from "@/models/Subscription";
import PlatformExpenseModel from "@/models/PlatformExpense";
import { getFxRates } from "@/lib/fx";
import {
  mrrHistory,
  paddleFeeEstimate,
  profitForMonth,
  monthKey,
  monthlyAmountCents,
  toUsdDollars,
  isRevenueActive,
  type AdminSubscriptionLike,
} from "@/lib/admin-stats";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import AdminOverviewClient from "./AdminOverviewClient";
import RevenueChart from "./RevenueChart";
import ExpensesCard, { type ExpenseItem } from "./ExpensesCard";

/** Always fresh from the database — never statically prerendered. */
export const dynamic = "force-dynamic";

async function getAdminFinance() {
  await connectDB();
  const now = new Date();
  const currentMonth = monthKey(now);

  const [subsRaw, users, teamsRaw, expensesRaw, fx] = await Promise.all([
    SubscriptionModel.find().lean(),
    UserModel.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .select("name email plan role createdAt onboardingCompleted")
      .lean(),
    TeamModel.find().select("name plan").lean(),
    PlatformExpenseModel.find({ month: currentMonth }).sort({ createdAt: -1 }).lean(),
    getFxRates("USD").catch(() => null),
  ]);

  const [totalUsers, planBreakdown, paidTeams] = await Promise.all([
    UserModel.countDocuments(),
    UserModel.aggregate([{ $group: { _id: "$plan", count: { $sum: 1 } } }]),
    TeamModel.countDocuments({ subscriptionId: { $exists: true, $ne: null } }),
  ]);

  const rates: Record<string, number> = fx?.rates ?? {};
  const fxAvailable = fx !== null;

  const subs: AdminSubscriptionLike[] = subsRaw.map((s) => ({
    amount: s.amount,
    currency: s.currency,
    interval: s.interval,
    status: s.status,
    createdAt: s.createdAt,
    cancelledAt: s.cancelledAt ?? null,
    currentPeriodEnd: s.currentPeriodEnd ?? null,
  }));

  const teamName = new Map<string, string>();
  const teamPlan = new Map<string, string>();
  for (const t of teamsRaw) {
    teamName.set(t._id.toString(), t.name);
    teamPlan.set(t._id.toString(), t.plan);
  }

  // ── Money (all USD) ──────────────────────────────────────────────────────
  const history = mrrHistory(subs, rates, now);
  const current = history[history.length - 1];
  const mrr = current.mrr;
  const arr = Math.round(mrr * 12 * 100) / 100;
  const fees = paddleFeeEstimate(subs, rates, now);
  const expensesTotal = expensesRaw.reduce((sum, e) => sum + (e.amount || 0), 0);
  const profit = profitForMonth(mrr, fees.total, expensesTotal);

  const activeSubs = subs.filter(isRevenueActive);
  const pastDueSubs = subs.filter((s) => s.status === "past_due");
  const pastDueMrr = pastDueSubs.reduce((sum, s) => {
    const usd = toUsdDollars(monthlyAmountCents(s), s.currency, rates);
    return sum + (usd ?? 0);
  }, 0);
  const trialSubs = subs.filter((s) => s.status === "trialing");
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const trialsEndingSoon = trialSubs.filter(
    (s) => s.currentPeriodEnd && new Date(s.currentPeriodEnd) <= in7d,
  ).length;
  const unconvertible = subs.filter(
    (s) => isRevenueActive(s) && toUsdDollars(1, s.currency, rates) === null,
  ).length;

  // ── Top teams by MRR ─────────────────────────────────────────────────────
  const byTeam = new Map<string, number>();
  for (const r of subsRaw) {
    if (!isRevenueActive(r)) continue;
    const usd = toUsdDollars(monthlyAmountCents(r), r.currency, rates);
    if (usd === null) continue;
    const id = r.teamId.toString();
    byTeam.set(id, (byTeam.get(id) ?? 0) + usd);
  }
  const topTeams = [...byTeam.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([teamId, value]) => ({
      teamId,
      name: teamName.get(teamId) ?? "Unknown team",
      plan: teamPlan.get(teamId) ?? "free",
      mrr: Math.round(value * 100) / 100,
    }));

  // ── Recent subscriptions ─────────────────────────────────────────────────
  const recentSubs = [...subsRaw]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8)
    .map((r) => ({
      teamId: r.teamId.toString(),
      team: teamName.get(r.teamId.toString()) ?? "Unknown team",
      plan: r.plan,
      interval: r.interval,
      amount: r.amount,
      currency: r.currency,
      monthlyUsd: toUsdDollars(monthlyAmountCents(r), r.currency, rates),
      status: r.status,
      createdAt: new Date(r.createdAt).toISOString(),
    }));

  const planMap: Record<string, number> = { free: 0, starter: 0, growth: 0, pro: 0 };
  for (const p of planBreakdown) planMap[p._id] = p.count;
  const paidUsers = (planMap.starter ?? 0) + (planMap.growth ?? 0) + (planMap.pro ?? 0);
  const conversionRate = totalUsers > 0 ? ((paidUsers / totalUsers) * 100).toFixed(1) : "0";

  const expenses: ExpenseItem[] = expensesRaw.map((e) => ({
    id: e._id.toString(),
    name: e.name,
    category: e.category,
    amount: e.amount,
    month: e.month,
    isRecurring: e.isRecurring,
    notes: e.notes ?? "",
    createdAt: new Date(e.createdAt).toISOString(),
  }));

  return {
    updatedAt: now.toISOString(),
    currentMonth,
    fxAvailable,
    unconvertible,
    history,
    mrr,
    arr,
    newMrr: current.newMrr,
    churnedMrr: current.churnedMrr,
    fees,
    expensesTotal: Math.round(expensesTotal * 100) / 100,
    profit,
    activeSubCount: activeSubs.length,
    trialingCount: trialSubs.length,
    trialsEndingSoon,
    pastDueCount: pastDueSubs.length,
    pastDueMrr: Math.round(pastDueMrr * 100) / 100,
    topTeams,
    recentSubs,
    totalUsers,
    planMap,
    paidUsers,
    conversionRate,
    paidTeams,
    recentUsers: users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      plan: u.plan,
      createdAt: new Date(u.createdAt).toISOString(),
    })),
    expenses,
  };
}

export default async function AdminOverviewPage() {
  const d = await getAdminFinance();

  return (
    <AdminOverviewClient updatedAt={d.updatedAt}>
      {!d.fxAvailable && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
          FX rates are unavailable right now — non-USD subscriptions are excluded from the
          USD totals below{d.unconvertible > 0 ? ` (${d.unconvertible} subscription${d.unconvertible === 1 ? "" : "s"})` : ""}.
          USD subscriptions are unaffected.
        </p>
      )}

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "MRR",
            value: formatCurrency(d.mrr, "USD"),
            sub: `+${formatCurrency(d.newMrr, "USD")} new · −${formatCurrency(d.churnedMrr, "USD")} churned`,
            tone: "text-green-600 dark:text-green-400",
          },
          {
            label: "ARR",
            value: formatCurrency(d.arr, "USD"),
            sub: "MRR × 12",
            tone: "text-[var(--color-foreground)]",
          },
          {
            label: `Net Profit · ${d.currentMonth}`,
            value: formatCurrency(d.profit, "USD"),
            sub: `MRR − ${formatCurrency(d.fees.total, "USD")} fees − ${formatCurrency(d.expensesTotal, "USD")} expenses`,
            tone: d.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
          },
          {
            label: "Active Subscriptions",
            value: d.activeSubCount,
            sub: `${d.trialingCount} trialing · ${d.pastDueCount} past due`,
            tone: "text-[var(--color-foreground)]",
          },
        ].map(({ label, value, sub, tone }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium mb-2">{label}</p>
              <p className={`text-2xl font-bold ${tone}`}>{value}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Revenue — last 12 months</CardTitle>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            MRR is subscription value in USD, reconstructed from subscription start and
            cancellation dates. It is not collected cash — Paddle holds no payment history
            in this database.
          </p>
        </CardHeader>
        <CardContent>
          <RevenueChart data={d.history} />
        </CardContent>
      </Card>

      {/* Profit breakdown + expenses */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Profit breakdown · {d.currentMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5 text-sm">
              {[
                { label: "MRR", value: d.mrr, tone: "" },
                { label: `Paddle fees (est. — 5% + $0.50 × ${d.fees.chargeCount} charges)`, value: -d.fees.total, tone: "text-red-600 dark:text-red-400" },
                { label: "Platform expenses (recorded)", value: -d.expensesTotal, tone: "text-red-600 dark:text-red-400" },
              ].map(({ label, value, tone }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[var(--color-muted-foreground)]">{label}</span>
                  <span className={`font-semibold ${tone}`}>
                    {value < 0 ? "−" : ""}{formatCurrency(Math.abs(value), "USD")}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2.5">
                <span className="font-semibold">Net profit</span>
                <span className={`font-bold ${d.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {formatCurrency(d.profit, "USD")}
                </span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] pt-1">
                Paddle fees are an estimate from Paddle&apos;s published schedule, counted from
                subscriptions whose billing period ends this month. Record platform costs in
                the expenses card to make profit exact.
              </p>
              {d.pastDueMrr > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {formatCurrency(d.pastDueMrr, "USD")}/mo of MRR is past due ({d.pastDueCount} subscription
                  {d.pastDueCount === 1 ? "" : "s"}) — at risk until payment succeeds.
                </p>
              )}
              {d.trialsEndingSoon > 0 && (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {d.trialsEndingSoon} trial{d.trialsEndingSoon === 1 ? "" : "s"} end
                  {d.trialsEndingSoon === 1 ? "s" : ""} within 7 days.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <ExpensesCard
          initialMonth={d.currentMonth}
          initialExpenses={d.expenses}
          initialTotal={d.expensesTotal}
        />
      </div>

      {/* Top teams + recent subscriptions */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top teams by MRR</CardTitle>
          </CardHeader>
          <CardContent>
            {d.topTeams.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">No paying teams yet.</p>
            ) : (
              <div className="space-y-2.5">
                {d.topTeams.map((t) => (
                  <div key={t.teamId} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)] capitalize">{t.plan}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(t.mrr, "USD")}/mo</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent subscriptions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {d.recentSubs.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)] px-5 py-4">No subscriptions yet.</p>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {d.recentSubs.map((s) => (
                  <div key={`${s.teamId}-${s.createdAt}`} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.team}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)] capitalize">
                        {s.plan} · {s.interval}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">
                      {s.monthlyUsd !== null ? `${formatCurrency(s.monthlyUsd, "USD")}/mo` : "—"}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                        s.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                        s.status === "trialing" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                        s.status === "past_due" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                        "bg-slate-100 text-slate-500 dark:bg-slate-800"
                      }`}
                    >
                      {s.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Platform KPIs (existing) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: d.totalUsers },
          { label: "Paid Subscribers", value: d.paidUsers },
          { label: "Conversion Rate", value: `${d.conversionRate}%` },
          { label: "Active Teams", value: d.paidTeams },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium mb-2">{label}</p>
              <p className="text-2xl font-bold text-[var(--color-foreground)]">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan breakdown (existing) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Users by Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(["free", "starter", "growth", "pro"] as const).map((plan) => {
              const count = d.planMap[plan] ?? 0;
              const pct = d.totalUsers > 0 ? Math.round((count / d.totalUsers) * 100) : 0;
              const colors: Record<string, string> = {
                free: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                starter: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                growth: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
                pro: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
              };
              return (
                <div key={plan} className={`rounded-xl p-4 ${colors[plan]}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide capitalize mb-1">{plan}</p>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs opacity-70">{pct}% of total</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent signups (existing) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Signups</CardTitle>
            <Link href="/admin/users" className="text-xs text-[var(--color-primary)] hover:underline">
              View all →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-[var(--color-border)]">
            {d.recentUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-white text-sm font-bold flex-shrink-0">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{u.name}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                      u.plan === "pro" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                      u.plan === "growth" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" :
                      u.plan === "starter" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                      "bg-slate-100 text-slate-500 dark:bg-slate-800"
                    }`}
                  >
                    {u.plan}
                  </span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AdminOverviewClient>
  );
}
