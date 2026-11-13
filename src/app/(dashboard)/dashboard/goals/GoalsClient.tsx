"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Plus, Bell, TrendingUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/use-async-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/components/dashboard/CurrencyContext";

interface GoalRow {
  id: string;
  month: string;
  targetProfit: number;
  targetRevenue?: number;
  currentProfit: number;
  currentRevenue: number;
  progressPercent: number;
  currency: string;
  alertsEnabled: boolean;
  alertEmail: boolean;
  alertThreshold: number;
}

interface GoalForm {
  month: string;
  targetProfit: number;
  targetRevenue?: number;
  alertThreshold: number;
}

function GoalCard({ goal }: { goal: GoalRow }) {
  const { formatMoney } = useCurrency();
  const pct = Math.max(0, Math.min(100, goal.progressPercent));
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  const [year, mo] = goal.month.split("-");
  const label = new Date(parseInt(year), parseInt(mo) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-[var(--color-muted-foreground)] mb-1">{label}</p>
            {/* Current progress is converted into the goal's own
                currency, so current and target are comparable. */}
            <p className="text-2xl font-bold text-[var(--color-foreground)]">{formatMoney(goal.currentProfit, goal.currency)}</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">of {formatMoney(goal.targetProfit, goal.currency)} target</p>
          </div>
          <div className="text-right">
            <p className={cn("text-2xl font-extrabold", pct >= 80 ? "text-green-500" : pct >= 50 ? "text-yellow-500" : "text-red-500")}>
              {pct.toFixed(0)}%
            </p>
            {goal.alertsEnabled && (
              <Bell className="h-4 w-4 text-[var(--color-primary)] ml-auto mt-1" />
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full h-2.5 rounded-full bg-[var(--color-muted)] overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", color)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-[var(--color-muted-foreground)] mt-1">
          <span>0</span>
          <span>{formatMoney(goal.targetProfit, goal.currency)}</span>
        </div>
        {goal.targetRevenue && (
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-sm">
            <span className="text-[var(--color-muted-foreground)] flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Revenue progress
            </span>
            <span className="font-medium text-[var(--color-foreground)]">
              {formatMoney(goal.currentRevenue, goal.currency)} / {formatMoney(goal.targetRevenue, goal.currency)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function GoalsClient({ goals }: { goals: GoalRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The target is saved in the currency the user is working in
  // (their display currency) — show it on the form so the target is
  // never typed in an unknown currency.
  const { currency: displayCurrency } = useCurrency();

  const currentMonth = new Date().toISOString().slice(0, 7);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<GoalForm>({
    defaultValues: { month: currentMonth, alertThreshold: 70 },
  });

  const createAction = useAsyncAction(async (data: GoalForm) => {
    setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Failed to create goal");
        return;
      }
      reset();
      setShowForm(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
  });

  const onSubmit = (data: GoalForm) => {
    void createAction.run(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Target className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Profit Goals</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">Track monthly targets and get alerts when you&apos;re falling behind.</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Goal
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Set Profit Goal</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)}>
              <fieldset disabled={createAction.loading} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-0 m-0 min-w-0 p-0">
              {error && <div role="alert" className="sm:col-span-2 lg:col-span-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-2 text-sm text-red-600">{error}</div>}
              <div className="space-y-1.5">
                <Label htmlFor="month">Month</Label>
                <Input id="month" type="month" {...register("month", { required: "Required" })} />
                {errors.month && <p className="text-xs text-red-500">{errors.month.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="targetProfit">Target Net Profit ({displayCurrency})</Label>
                <Input id="targetProfit" type="number" min={0} step={100} placeholder="5000" {...register("targetProfit", { required: "Required", valueAsNumber: true })} />
                {errors.targetProfit && <p className="text-xs text-red-500">{errors.targetProfit.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="targetRevenue">Target Revenue ({displayCurrency}) <span className="text-[var(--color-muted-foreground)]">(optional)</span></Label>
                <Input id="targetRevenue" type="number" min={0} step={100} placeholder="20000" {...register("targetRevenue", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alertThreshold">Alert when below % of goal</Label>
                <Input id="alertThreshold" type="number" min={10} max={100} step={5} {...register("alertThreshold", { valueAsNumber: true })} />
              </div>
              <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
                <Button type="submit" loading={createAction.loading} loadingText="Creating goal…" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Goal
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
              <p className="sm:col-span-2 lg:col-span-4 text-xs text-[var(--color-muted-foreground)]">Targets are saved in {displayCurrency} (your display currency). Progress converts each order into that currency before comparing, so multi-currency months count correctly.</p>
              </fieldset>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Goals grid */}
      {goals.length === 0 && !showForm && (
        <div className="text-center py-16 text-[var(--color-muted-foreground)]">
          <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium mb-1">No profit goals yet</p>
          <p className="text-sm mb-4">Set a monthly profit target and get email alerts when you&apos;re falling behind.</p>
          <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" />Create Your First Goal</Button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {goals.map((g) => <GoalCard key={g.id} goal={g} />)}
      </div>
    </div>
  );
}
