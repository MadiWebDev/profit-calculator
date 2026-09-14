"use client";

import { useMemo, useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { Copy, Share2, RefreshCw, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCalculator } from "@/config/calculators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ResultsChart } from "@/components/ResultsChart";
import { formatCurrency, formatPercent, formatNumber, buildShareUrl, cn } from "@/lib/utils";
import { useCurrency } from "@/components/dashboard/CurrencyContext";

interface ProfitCalculatorProps {
  /** Pass only the slug — config is resolved client-side to avoid serializing functions */
  slug: string;
}

function makeFormatOutput(currency: string) {
  return function formatOutput(value: number, format: string): string {
    switch (format) {
      case "currency":   return formatCurrency(value, currency);
      case "percent":    return formatPercent(value);
      case "multiplier": return `${value.toFixed(2)}x`;
      default:           return formatNumber(value, 2);
    }
  };
}

function ResultTrendIcon({ value }: { value: number }) {
  if (value > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (value < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-[var(--color-muted-foreground)]" />;
}

export function ProfitCalculator({ slug }: ProfitCalculatorProps) {
  const config = getCalculator(slug);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState(false);
  const { currency, symbol } = useCurrency();

  // Bind formatOutput to the live currency so all outputs use the correct symbol
  const formatOutput = useMemo(() => makeFormatOutput(currency), [currency]);

  const defaultValues = useMemo(() => {
    if (!config) return {};
    const vals: Record<string, number> = {};
    config.fields.forEach((f) => {
      const param = searchParams.get(f.name);
      vals[f.name] = param ? parseFloat(param) || (f.defaultValue ?? 0) : (f.defaultValue ?? 0);
    });
    return vals;
  }, [config, searchParams]);

  const { register, watch, reset, formState: { errors } } = useForm<Record<string, number>>({
    defaultValues,
    mode: "onChange",
  });


  const watchedValues = watch();

  const results = useMemo(() => {
    if (!config) return null;
    try {
      const numValues: Record<string, number> = {};
      config.fields.forEach((f) => {
        numValues[f.name] = parseFloat(String(watchedValues[f.name])) || 0;
      });
      return config.compute(numValues);
    } catch {
      return null;
    }
  }, [config, watchedValues]);

  const chartData = useMemo(() => {
    if (!results || !config?.chartKeys) return [];
    const labelMap: Record<string, string> = {};
    config.fields.forEach((f) => (labelMap[f.name] = f.label));
    config.outputs.forEach((o) => (labelMap[o.key] = o.label));
    return config.chartKeys
      .map((key) => ({
        name: labelMap[key] ?? key,
        value: Math.abs(results[key] ?? 0),
        color: "",
      }))
      .filter((d) => d.value > 0);
  }, [results, config]);

  const handleShare = useCallback(async () => {
    if (!config) return;
    const values: Record<string, string> = {};
    config.fields.forEach((f) => {
      values[f.name] = String(watchedValues[f.name] ?? f.defaultValue ?? 0);
    });
    const path = buildShareUrl(config.slug, values as unknown as Record<string, number>);
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      router.push(path);
    }
  }, [watchedValues, config, router]);

  const handleCopyResults = useCallback(async () => {
    if (!results || !config) return;
    const lines = config.outputs.map(
      (o) => `${o.label}: ${formatOutput(results[o.key] ?? 0, o.format)}`
    );
    const text = `${config.title} Results (${currency})\n${"=".repeat(30)}\n${lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [results, config, formatOutput, currency]);

  const handleReset = useCallback(() => {
    if (!config) return;
    const defaults: Record<string, number> = {};
    config.fields.forEach((f) => (defaults[f.name] = f.defaultValue ?? 0));
    reset(defaults);
  }, [config, reset]);

  // Render guard — after all hooks
  if (!config) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
        Calculator not found.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── INPUT PANEL ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Inputs</CardTitle>
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 gap-1 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.fields.map((field) => {
                const err = errors[field.name];
                return (
                  <div key={field.name} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={field.name}>
                        {field.label}
                        {field.type === "percent" && (
                          <span className="ml-1 text-[var(--color-muted-foreground)]">(%)</span>
                        )}
                      </Label>
                      {field.helpText && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" aria-label={`Help for ${field.label}`}>
                              <Info className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{field.helpText}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="relative">
                      {field.type === "currency" && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted-foreground)] pointer-events-none select-none">
                          {symbol}
                        </span>
                      )}
                      <Input
                        id={field.name}
                        type="number"
                        inputMode="decimal"
                        step={field.step ?? (field.type === "percent" ? "0.1" : "0.01")}
                        min={field.min ?? 0}
                        max={field.max}
                        placeholder={String(field.defaultValue ?? 0)}
                        className={cn(field.type === "currency" && "pl-7")}
                        aria-invalid={!!err}
                        {...register(field.name, {
                          valueAsNumber: true,
                          min: { value: field.min ?? 0, message: `Min is ${field.min ?? 0}` },
                          max: field.max ? { value: field.max, message: `Max is ${field.max}` } : undefined,
                        })}
                      />
                    </div>
                    {err && (
                      <p className="text-xs text-red-500" role="alert">
                        {String(err.message ?? "Invalid value")}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* ── RESULTS PANEL ────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Results</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyResults} className="h-8 gap-1.5 text-xs">
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleShare} className="h-8 gap-1.5 text-xs">
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {results ? (
                <>
                  {/* Highlighted metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                    {config.outputs
                      .filter((o) => o.highlight)
                      .map((output) => {
                        const val = results[output.key] ?? 0;
                        const isNeg = val < 0;
                        return (
                          <div
                            key={output.key}
                            className={cn(
                              "rounded-lg p-3 border",
                              isNeg
                                ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
                                : "bg-[var(--color-accent)] border-[var(--color-border)]"
                            )}
                          >
                            <p className="text-xs text-[var(--color-muted-foreground)] mb-1">{output.label}</p>
                            <div className="flex items-center gap-1">
                              <ResultTrendIcon value={val} />
                              <p
                                className={cn(
                                  "text-lg font-bold leading-tight",
                                  isNeg ? "text-red-600 dark:text-red-400" : "text-[var(--color-primary)]"
                                )}
                              >
                              {formatOutput(val, output.format)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Secondary metrics */}
                  <div className="space-y-1">
                    {config.outputs
                      .filter((o) => !o.highlight)
                      .map((output) => {
                        const val = results[output.key] ?? 0;
                        return (
                          <div
                            key={output.key}
                            className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-[var(--color-muted)] text-sm"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-[var(--color-muted-foreground)]">{output.label}</span>
                              {output.description && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" aria-label={output.description}>
                                      <Info className="h-3 w-3 text-[var(--color-muted-foreground)]" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>{output.description}</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <span
                              className={cn(
                                "font-semibold",
                                val < 0 ? "text-red-500" : "text-[var(--color-foreground)]"
                              )}
                            >
                              {formatOutput(val, output.format)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--color-muted-foreground)] text-center py-8">
                  Enter values above to see results
                </p>
              )}
            </CardContent>
          </Card>

          {/* Chart */}
          {chartData.length > 0 && results && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cost &amp; Profit Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResultsChart data={chartData} type="pie" />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
