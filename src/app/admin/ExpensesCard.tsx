"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";

export interface ExpenseItem {
  id: string;
  name: string;
  category: string;
  amount: number;
  month: string;
  isRecurring: boolean;
  notes: string;
  createdAt: string;
}

const CATEGORIES = ["hosting", "database", "tools", "marketing", "other"] as const;

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ExpensesCard({
  initialMonth,
  initialExpenses,
  initialTotal,
}: {
  initialMonth: string;
  initialExpenses: ExpenseItem[];
  initialTotal: number;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [expenses, setExpenses] = useState<ExpenseItem[]>(initialExpenses);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("hosting");
  const [recurring, setRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/expenses?month=${key}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load expenses");
      setExpenses(data.expenses);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (month !== initialMonth) void load(month);
  }, [month, initialMonth, load]);

  const addExpense = async () => {
    const value = Number(amount);
    if (!name.trim() || !Number.isFinite(value) || value <= 0) {
      setError("Enter a name and a positive amount.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), amount: value, category, month, isRecurring: recurring }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save expense");
      setExpenses((prev) => [data, ...prev]);
      setTotal((prev) => Math.round((prev + data.amount) * 100) / 100);
      setName("");
      setAmount("");
      setRecurring(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (id: string, value: number) => {
    setError("");
    try {
      const res = await fetch(`/api/admin/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete expense");
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      setTotal((prev) => Math.round((prev - value) * 100) / 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete expense");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Platform Expenses</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-32 text-center">{monthLabel(month)}</span>
            <Button variant="ghost" size="sm" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Real costs of running GetProfitCalc — record them here and the profit number
          becomes real. Paddle fees are shown separately as an estimate.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-[var(--color-muted-foreground)]">Total this month</span>
          <span className="text-2xl font-bold text-[var(--color-foreground)]">{formatCurrency(total, "USD")}</span>
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
        )}

        {loading ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            No expenses recorded for {monthLabel(month)} yet.
          </p>
        ) : (
          <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{e.name}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] capitalize">
                    {e.category}{e.isRecurring ? " · recurring" : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[var(--color-foreground)]">
                  {formatCurrency(e.amount, "USD")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void deleteExpense(e.id, e.amount)}
                  aria-label={`Delete ${e.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-[1fr_120px_130px_auto] gap-2 items-end">
          <div>
            <Label htmlFor="exp-name" className="text-xs">Name</Label>
            <Input
              id="exp-name"
              placeholder="e.g. Vercel Pro"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="exp-amount" className="text-xs">Amount (USD)</Label>
            <Input
              id="exp-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="25.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="exp-category" className="text-xs">Category</Label>
            <select
              id="exp-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1 text-sm text-[var(--color-foreground)]"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </div>
          <Button onClick={() => void addExpense()} disabled={saving}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
          />
          Recurring monthly cost
        </label>
      </CardContent>
    </Card>
  );
}
