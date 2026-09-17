"use client";

import { useMemo, useCallback, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { Copy, Share2, RefreshCw, TrendingUp, TrendingDown, Minus, Info, Download } from "lucide-react";
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
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const { currency, symbol } = useCurrency();
  
  // Refs for capturing content
  const inputPanelRef = useRef<HTMLDivElement>(null);
  const resultsPanelRef = useRef<HTMLDivElement>(null);
  const chartPanelRef = useRef<HTMLDivElement>(null);

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

  const handleDownloadPDF = useCallback(async () => {
  if (!config || !results) return;

  setIsGeneratingPDF(true);

  try {
    const { default: jsPDF } = await import("jspdf");
    const html2canvas = (await import("html2canvas")).default;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const margin = 10;
    const contentWidth = pageWidth - margin * 2;

    /*
     * ---------------------------------------------------------
     * COLORS
     * ---------------------------------------------------------
     */
    const primary = [44, 72, 58] as const;
    const primaryDark = [31, 52, 41] as const;
    const accent = [241, 238, 230] as const;
    const border = [220, 220, 220] as const;
    const text = [35, 35, 35] as const;
    const muted = [105, 105, 105] as const;
    const white = [255, 255, 255] as const;
    const negative = [185, 55, 55] as const;
    const positive = [38, 120, 75] as const;

    let y = margin;

    /*
     * ---------------------------------------------------------
     * HELPERS
     * ---------------------------------------------------------
     */

    const roundedBox = (
      x: number,
      top: number,
      width: number,
      height: number,
      fill: readonly number[],
      radius = 3
    ) => {
      pdf.setFillColor(fill[0], fill[1], fill[2]);
      pdf.roundedRect(x, top, width, height, radius, radius, "F");
    };

    const drawSectionHeader = (
      title: string,
      top: number,
      width = contentWidth
    ) => {
      roundedBox(margin, top, width, 8, primary, 2);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(255, 255, 255);
      pdf.text(title, margin + 4, top + 5.4);

      return top + 10;
    };

    const drawLabelValue = (
      label: string,
      value: string,
      x: number,
      top: number,
      width: number,
      negativeValue = false
    ) => {
      pdf.setDrawColor(border[0], border[1], border[2]);
      pdf.setFillColor(255, 255, 255);

      pdf.roundedRect(x, top, width, 9, 1.8, 1.8, "FD");

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(muted[0], muted[1], muted[2]);

      pdf.text(label, x + 3, top + 3.7);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);

      const valueColor = negativeValue ? negative : text;

      pdf.setTextColor(
        valueColor[0],
        valueColor[1],
        valueColor[2]
      );

      pdf.text(value, x + 3, top + 7.2);

      return top + 10.5;
    };

    /*
     * ---------------------------------------------------------
     * HEADER
     * ---------------------------------------------------------
     */

    roundedBox(
      margin,
      y,
      contentWidth,
      25,
      primaryDark,
      4
    );

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.setTextColor(...white);

    const titleLines = pdf.splitTextToSize(
      config.title,
      contentWidth - 12
    );

    pdf.text(titleLines[0], margin + 6, y + 9);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(220, 230, 224);

    pdf.text(
      `Profit Calculator • Currency: ${currency}`,
      margin + 6,
      y + 15
    );

    pdf.setFontSize(7.5);
    pdf.setTextColor(190, 205, 195);

    pdf.text(
      `Generated ${new Date().toLocaleDateString()}`,
      margin + 6,
      y + 20
    );

    y += 30;

    /*
     * ---------------------------------------------------------
     * INPUTS
     * ---------------------------------------------------------
     */

    y = drawSectionHeader("INPUTS", y);

    const inputColumns = 2;
    const inputGap = 4;
    const inputWidth =
      (contentWidth - inputGap) / inputColumns;

    let inputY = y;

    config.fields.forEach((field, index) => {
      const column = index % inputColumns;
      const row = Math.floor(index / inputColumns);

      const x =
        margin + column * (inputWidth + inputGap);

      const rowY =
        inputY + row * 10.5;

      const rawValue =
        watchedValues[field.name] ??
        field.defaultValue ??
        0;

      let formattedValue = String(rawValue);

      if (field.type === "currency") {
        formattedValue = formatCurrency(
          Number(rawValue),
          currency
        );
      } else if (field.type === "percent") {
        formattedValue = `${rawValue}%`;
      }

      drawLabelValue(
        field.label,
        formattedValue,
        x,
        rowY,
        inputWidth
      );
    });

    const inputRows = Math.ceil(
      config.fields.length / inputColumns
    );

    y =
      inputY +
      inputRows * 10.5 +
      3;

    /*
     * ---------------------------------------------------------
     * RESULTS
     * ---------------------------------------------------------
     */

    y = drawSectionHeader("RESULTS", y);

    const highlightedOutputs = config.outputs.filter(
      (output) => output.highlight
    );

    const normalOutputs = config.outputs.filter(
      (output) => !output.highlight
    );

    /*
     * Highlighted results
     */
    if (highlightedOutputs.length > 0) {
      const columns = Math.min(
        highlightedOutputs.length,
        3
      );

      const gap = 4;
      const width =
        (contentWidth - gap * (columns - 1)) /
        columns;

      highlightedOutputs.forEach((output, index) => {
        const value = results[output.key] ?? 0;
        const isNegative = value < 0;

        const x =
          margin + index * (width + gap);

        const fill = isNegative
          ? [252, 239, 239]
          : accent;

        roundedBox(
          x,
          y,
          width,
          18,
          fill,
          2.5
        );

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(
          muted[0],
          muted[1],
          muted[2]
        );

        pdf.text(
          output.label,
          x + 3,
          y + 5
        );

        const valueColor = isNegative
          ? negative
          : positive;

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(
          valueColor[0],
          valueColor[1],
          valueColor[2]
        );

        pdf.text(
          formatOutput(
            value,
            output.format
          ),
          x + 3,
          y + 13
        );
      });

      y += 22;
    }

    /*
     * Normal results
     */
    if (normalOutputs.length > 0) {
      const resultColumns = 2;
      const resultGap = 4;

      const resultWidth =
        (contentWidth - resultGap) /
        resultColumns;

      normalOutputs.forEach((output, index) => {
        const value = results[output.key] ?? 0;

        const column = index % resultColumns;
        const row = Math.floor(
          index / resultColumns
        );

        const x =
          margin +
          column *
            (resultWidth + resultGap);

        const rowY =
          y + row * 10.5;

        drawLabelValue(
          output.label,
          formatOutput(
            value,
            output.format
          ),
          x,
          rowY,
          resultWidth,
          value < 0
        );
      });

      const rows = Math.ceil(
        normalOutputs.length /
          resultColumns
      );

      y += rows * 10.5 + 3;
    }

    /*
 * ---------------------------------------------------------
 * CHART
 * ---------------------------------------------------------
 */

if (
  chartPanelRef.current &&
  chartData.length > 0
) {
  /*
   * Large centered section title
   */
  const chartTitleHeight = 16;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(
    primary[0],
    primary[1],
    primary[2]
  );

  pdf.text(
    "Cost & Profit Breakdown",
    pageWidth / 2,
    y + 8,
    {
      align: "center",
    }
  );

  /*
   * Small subtitle
   */
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(
    muted[0],
    muted[1],
    muted[2]
  );

  pdf.text(
    "Visual breakdown of your calculated costs and profit",
    pageWidth / 2,
    y + 13,
    {
      align: "center",
    }
  );

  y += chartTitleHeight;

  /*
   * Capture ONLY the chart.
   */
  const chartElement =
    chartPanelRef.current.querySelector(
      ".recharts-responsive-container"
    ) ||
    chartPanelRef.current;

  /*
   * Temporarily force a large chart rendering area.
   */
  const originalWidth =
    (chartElement as HTMLElement).style.width;

  const originalHeight =
    (chartElement as HTMLElement).style.height;

  const element = chartElement as HTMLElement;

  element.style.width = "700px";
  element.style.height = "400px";

  const chartCanvas =
    await html2canvas(element, {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      removeContainer: true,
      width: 700,
      height: 400,
    });

  /*
   * Restore original dimensions.
   */
  element.style.width = originalWidth;
  element.style.height = originalHeight;

  /*
   * ---------------------------------------------------------
   * LARGE CENTERED CHART
   * ---------------------------------------------------------
   */

  const availableHeight =
    pageHeight - y - margin - 8;

  /*
   * Keep the chart large while still fitting
   * completely on the A4 page.
   */
  let chartWidth = contentWidth - 6;
  let chartHeight =
    (chartCanvas.height * chartWidth) /
    chartCanvas.width;

  /*
   * Limit height if necessary.
   */
  if (chartHeight > availableHeight) {
    chartHeight = availableHeight;

    chartWidth =
      (chartCanvas.width * chartHeight) /
      chartCanvas.height;
  }

  /*
   * Center horizontally.
   */
  const chartX =
    (pageWidth - chartWidth) / 2;

  /*
   * ---------------------------------------------------------
   * CHART CONTAINER
   * ---------------------------------------------------------
   */

  pdf.setDrawColor(
    border[0],
    border[1],
    border[2]
  );

  pdf.setFillColor(
    white[0],
    white[1],
    white[2]
  );

  pdf.roundedRect(
    chartX - 3,
    y - 2,
    chartWidth + 6,
    chartHeight + 4,
    4,
    4,
    "FD"
  );

  /*
   * Subtle colored top accent.
   */
  pdf.setFillColor(
    primary[0],
    primary[1],
    primary[2]
  );
  
  pdf.roundedRect(
    chartX - 3,
    y - 2,
    chartWidth + 6,
    2.5,
    1.5,
    1.5,
    "F"
  );

  /*
   * ---------------------------------------------------------
   * ADD LARGE CENTERED CHART
   * ---------------------------------------------------------
   */

  const chartImg =
    chartCanvas.toDataURL(
      "image/png",
      1
    );

  pdf.addImage(
    chartImg,
    "PNG",
    chartX,
    y,
    chartWidth,
    chartHeight,
    undefined,
    "FAST"
  );

  /*
   * Move cursor after chart.
   */
  y += chartHeight + 6;

  /*
   * ---------------------------------------------------------
   * CHART FOOTNOTE
   * ---------------------------------------------------------
   */

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(
    muted[0],
    muted[1],
    muted[2]
  );

  pdf.text(
    "Values shown are based on the inputs entered above.",
    pageWidth / 2,
    Math.min(
      y,
      pageHeight - margin
    ),
    {
      align: "center",
    }
  );
}

    /*
     * ---------------------------------------------------------
     * FOOTER
     * ---------------------------------------------------------
     */

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(
      muted[0],
      muted[1],
      muted[2]
    );

    pdf.text(
      "Generated by CalcProfit",
      margin,
      pageHeight - 5
    );

    pdf.text(
      "Calculator results are based on the values entered.",
      pageWidth - margin,
      pageHeight - 5,
      {
        align: "right",
      }
    );

    /*
     * ---------------------------------------------------------
     * DOWNLOAD
     * ---------------------------------------------------------
     */

    const safeName =
      config.slug
        .replace(/[^a-z0-9-]/gi, "-")
        .toLowerCase();

    pdf.save(
      `${safeName}-calculator.pdf`
    );
  } catch (error) {
    console.error(
      "PDF generation error:",
      error
    );

    alert(
      "Unable to generate the PDF. Please try again."
    );
  } finally {
    setIsGeneratingPDF(false);
  }
}, [
  config,
  results,
  currency,
  chartData,
  watchedValues,
  formatOutput,
]);

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
          <Card ref={inputPanelRef}>
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
          <Card ref={resultsPanelRef}>
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
                  <Button
  type="button"
  onClick={handleDownloadPDF}
  disabled={!results || isGeneratingPDF}
  className={cn(
    "h-9 gap-2 rounded-lg px-4 text-xs font-semibold",
    "bg-[var(--color-primary)] text-white",
    "shadow-sm transition-all duration-200",
    "hover:-translate-y-0.5 hover:shadow-md",
    "hover:bg-[var(--color-primary)]/90",
    "active:translate-y-0",
    "disabled:cursor-not-allowed disabled:opacity-50"
  )}
>
  <Download
    className={cn(
      "h-4 w-4",
      isGeneratingPDF && "animate-bounce"
    )}
  />

  {isGeneratingPDF
    ? "Preparing PDF..."
    : "Download PDF"}
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
            <Card ref={chartPanelRef}>
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
