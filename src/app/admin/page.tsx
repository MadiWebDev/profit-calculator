import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import TeamModel from "@/models/Team";
import { Users, CreditCard, TrendingUp, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

async function getAdminStats() {
  await connectDB();

  const [
    totalUsers,
    planBreakdown,
    recentUsers,
    paidTeams,
  ] = await Promise.all([
    UserModel.countDocuments(),
    UserModel.aggregate([
      { $group: { _id: "$plan", count: { $sum: 1 } } },
    ]),
    UserModel.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .select("name email plan role createdAt onboardingCompleted")
      .lean(),
    TeamModel.countDocuments({ subscriptionId: { $exists: true, $ne: null } }),
  ]);

  const planMap: Record<string, number> = { free: 0, starter: 0, growth: 0, pro: 0 };
  for (const p of planBreakdown) planMap[p._id] = p.count;

  return { totalUsers, planMap, recentUsers, paidTeams };
}

export default async function AdminOverviewPage() {
  const { totalUsers, planMap, recentUsers, paidTeams } = await getAdminStats();

  const paidUsers = (planMap.starter ?? 0) + (planMap.growth ?? 0) + (planMap.pro ?? 0);
  const conversionRate = totalUsers > 0 ? ((paidUsers / totalUsers) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Admin Overview</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
          Platform-wide stats and user management.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Users",      value: totalUsers,        icon: Users,      color: "text-blue-500" },
          { label: "Paid Subscribers", value: paidUsers,         icon: CreditCard, color: "text-green-500" },
          { label: "Conversion Rate",  value: `${conversionRate}%`, icon: TrendingUp, color: "text-yellow-500" },
          { label: "Active Teams",     value: paidTeams,         icon: Activity,   color: "text-purple-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-[var(--color-muted-foreground)] font-medium">{label}</p>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-[var(--color-foreground)]">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Users by Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(["free", "starter", "growth", "pro"] as const).map((plan) => {
              const count = planMap[plan] ?? 0;
              const pct   = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
              const colors: Record<string, string> = {
                free:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                starter: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                growth:  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
                pro:     "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
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

      {/* Recent signups */}
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
            {recentUsers.map((u) => (
              <div key={u._id.toString()} className="flex items-center gap-4 px-5 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-white text-sm font-bold flex-shrink-0">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{u.name}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                    u.plan === "pro"     ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                    u.plan === "growth"  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" :
                    u.plan === "starter" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                                           "bg-slate-100 text-slate-500 dark:bg-slate-800"
                  }`}>{u.plan}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
