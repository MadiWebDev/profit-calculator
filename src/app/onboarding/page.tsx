"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Store, Upload, ShoppingBag, Globe, Package,
  CheckCircle2, ArrowRight, ArrowLeft, Loader2,
  Calculator, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import Link from "next/link";

type Step = "choose" | "shopify" | "woocommerce" | "etsy" | "csv" | "done";

const PLATFORMS = [
  { id: "shopify",     label: "Shopify",     icon: ShoppingBag, desc: "Connect via OAuth — orders sync automatically" },
  { id: "woocommerce", label: "WooCommerce", icon: Globe,       desc: "Paste your API keys and site URL" },
  { id: "etsy",        label: "Etsy",        icon: Package,     desc: "Connect via OAuth — orders sync automatically" },
  { id: "csv",         label: "CSV Upload",  icon: Upload,      desc: "Upload a CSV export from any platform" },
];

const ERROR_MESSAGES: Record<string, string> = {
  invalid_callback:      "Shopify returned an invalid response. Please try again.",
  invalid_state:         "OAuth state was invalid or expired. Please try again.",
  csrf_mismatch:         "Security check failed (CSRF). Please try connecting again.",
  shop_mismatch:         "The store that authorised doesn't match what you entered. Please try again.",
  token_exchange_failed: "Shopify refused the authorisation code. Make sure your app credentials are correct.",
  db_error:              "We saved the connection but hit a database error. Please try again.",
};

const CSV_TEMPLATE_HEADERS = [
  "order_id", "order_date", "order_number", "customer_email",
  "gross_revenue", "discounts", "shipping_revenue", "shipping_cost",
  "cogs", "transaction_fees", "taxes", "refund_amount",
  "ad_spend_allocated", "status",
].join(",");

// ── Inner component that uses useSearchParams ────────────────────────────────

function OnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step,      setStep]      = useState<Step>("choose");
  const [platform,  setPlatform]  = useState<string>("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [connectedShop, setConnectedShop] = useState<string>("");

  // Shopify
  const [shopDomain, setShopDomain] = useState("");

  // WooCommerce
  const [wooUrl,    setWooUrl]    = useState("");
  const [wooKey,    setWooKey]    = useState("");
  const [wooSecret, setWooSecret] = useState("");
  const [storeName, setStoreName] = useState("");

  // CSV
  const [csvFile,    setCsvFile]    = useState<File | null>(null);
  const [csvStoreName, setCsvStoreName] = useState("");
  const [csvStatus,  setCsvStatus]  = useState<{ imported: number; errors: number } | null>(null);

  // ── Handle ?connected=shopify or ?error=xxx from the OAuth callback ────────
  useEffect(() => {
    const connected = searchParams.get("connected");
    const errKey    = searchParams.get("error");
    const shop      = searchParams.get("shop");

    if (connected === "shopify") {
      setConnectedShop(shop ?? "");
      setStep("done");
    } else if (errKey) {
      const msg = ERROR_MESSAGES[errKey] ?? `Connection failed (${errKey}). Please try again.`;
      setError(msg);
      // Go back to the shopify step so the user can retry
      setStep("shopify");
    }
    // Clean query params from URL without re-rendering
    if (connected || errKey) {
      window.history.replaceState({}, "", "/onboarding");
    }
  }, [searchParams]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const downloadTemplate = () => {
    // Use today's date so imported orders fall in the current period
    const today = new Date();
    const pad   = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const exampleRow = [
      "1001", todayStr, "#1001", "customer@example.com",
      "49.99", "0", "0", "4.50",
      "12.00", "1.75", "0", "0",
      "8.00", "fulfilled",
    ].join(",");
    const csv  = [CSV_TEMPLATE_HEADERS, exampleRow].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "profitcalc-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Normalise + validate the shop domain the user typed */
  const normaliseShopDomain = (raw: string): string | null => {
    let d = raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
    // If user typed just "mystorename" without the TLD, append it
    if (!d.includes(".")) d = `${d}.myshopify.com`;
    if (!/^[a-z0-9-]+\.myshopify\.com$/.test(d)) return null;
    return d;
  };

  // ── Connect handlers ──────────────────────────────────────────────────────

  const connectShopify = async () => {
    const domain = normaliseShopDomain(shopDomain);
    if (!domain) {
      setError("Enter a valid Shopify domain — e.g. your-store.myshopify.com");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/stores/shopify/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: domain }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to start Shopify connection.");
        return;
      }
      // Redirect to Shopify's OAuth page — page will navigate away
      if (json.oauthUrl) {
        window.location.href = json.oauthUrl;
      } else {
        setError(json.message ?? "No OAuth URL returned.");
      }
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const connectWoo = async () => {
    if (!wooUrl || !wooKey || !wooSecret) {
      setError("All WooCommerce fields are required.");
      return;
    }
    let hostname = "";
    try { hostname = new URL(wooUrl).hostname; } catch {
      setError("Enter a valid WordPress site URL (e.g. https://yourstore.com).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform:     "woocommerce",
          name:         storeName || hostname,
          wooSiteUrl:   wooUrl,
          accessToken:  wooKey,
          refreshToken: wooSecret,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Failed to connect WooCommerce store.");
        return;
      }
      setStep("done");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  const connectEtsy = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/stores/etsy/auth", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to start Etsy connection.");
        return;
      }
      if (json.oauthUrl) window.location.href = json.oauthUrl;
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  const importCSV = async () => {
    if (!csvFile)              { setError("Select a CSV file to upload.");  return; }
    if (!csvStoreName.trim())  { setError("Enter a store name.");           return; }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file",      csvFile);
      formData.append("storeName", csvStoreName);
      const res  = await fetch("/api/orders/import", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Import failed.");
        return;
      }
      setCsvStatus({ imported: json.imported, errors: json.errors });
      setStep("done");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const stepTitle: Record<Step, string> = {
    choose:      "Connect your first store",
    shopify:     "Connect Shopify",
    woocommerce: "Connect WooCommerce",
    etsy:        "Connect Etsy",
    csv:         "Import via CSV",
    done:        "You're all set! 🎉",
  };

  return (
    <div className="min-h-screen bg-[var(--color-muted)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 font-bold text-2xl mb-6">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
              <Calculator className="h-5 w-5" />
            </span>
            <span>Profit<span className="text-[var(--color-primary)]">Calc</span></span>
          </Link>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            {stepTitle[step]}
          </h1>
          {step === "choose" && (
            <p className="text-[var(--color-muted-foreground)] mt-1 text-sm">
              Pick your platform or upload a CSV — takes less than 2 minutes.
            </p>
          )}
          {step === "done" && (
            <p className="text-[var(--color-muted-foreground)] mt-1 text-sm">
              Your data is importing. Profit insights will appear within minutes.
            </p>
          )}
        </div>

        <div className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-6 sm:p-8 shadow-sm">

          {/* Error banner */}
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Choose platform ── */}
          {step === "choose" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLATFORMS.map(({ id, label, icon: Icon, desc }) => (
                <button
                  key={id}
                  onClick={() => { setPlatform(id); setStep(id as Step); setError(null); }}
                  className={cn(
                    "flex items-start gap-3 text-left p-4 rounded-xl border-2 transition-all",
                    "border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-accent)]"
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-muted)] flex-shrink-0 mt-0.5">
                    <Icon className="h-5 w-5 text-[var(--color-primary)]" />
                  </span>
                  <div>
                    <p className="font-semibold text-[var(--color-foreground)]">{label}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── Shopify ── */}
          {step === "shopify" && (
            <div className="space-y-5">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                We&apos;ll redirect you to Shopify to authorise the connection. Your store domain looks like{" "}
                <code className="bg-[var(--color-muted)] px-1.5 py-0.5 rounded text-xs">your-store.myshopify.com</code>.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="shop-domain">Shopify Store Domain</Label>
                <Input
                  id="shop-domain"
                  placeholder="your-store.myshopify.com"
                  value={shopDomain}
                  onChange={(e) => { setShopDomain(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && connectShopify()}
                  autoFocus
                />
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  You can also paste the full URL — we&apos;ll extract the domain.
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={connectShopify}
                  disabled={loading || !shopDomain.trim()}
                  className="gap-2 flex-1"
                >
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting to Shopify…</>
                    : <><ArrowRight className="h-4 w-4" /> Connect via OAuth</>}
                </Button>
                <Button variant="outline" onClick={() => { setStep("choose"); setError(null); }}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── WooCommerce ── */}
          {step === "woocommerce" && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Generate API keys in <strong>WooCommerce → Settings → Advanced → REST API</strong>.
                Set permissions to <em>Read/Write</em>.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="store-name">Store Name</Label>
                <Input id="store-name" placeholder="My WooCommerce Store" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="woo-url">WordPress Site URL</Label>
                <Input id="woo-url" placeholder="https://yourstore.com" value={wooUrl} onChange={(e) => setWooUrl(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="woo-key">Consumer Key</Label>
                  <Input id="woo-key" placeholder="ck_xxxxxxxx" value={wooKey} onChange={(e) => setWooKey(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="woo-secret">Consumer Secret</Label>
                  <Input id="woo-secret" type="password" placeholder="cs_xxxxxxxx" value={wooSecret} onChange={(e) => setWooSecret(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={connectWoo} disabled={loading} className="gap-2 flex-1">
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                    : <><Store className="h-4 w-4" /> Connect WooCommerce</>}
                </Button>
                <Button variant="outline" onClick={() => { setStep("choose"); setError(null); }}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Etsy ── */}
          {step === "etsy" && (
            <div className="space-y-5">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                We&apos;ll redirect you to Etsy to authorise access to your shop orders.
                No data is shared without your permission.
              </p>
              <div className="flex gap-3">
                <Button onClick={connectEtsy} disabled={loading} className="gap-2 flex-1">
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting to Etsy…</>
                    : <><ArrowRight className="h-4 w-4" /> Connect via Etsy OAuth</>}
                </Button>
                <Button variant="outline" onClick={() => { setStep("choose"); setError(null); }}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── CSV ── */}
          {step === "csv" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--color-accent)] border border-[var(--color-border)]">
                <Upload className="h-5 w-5 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-foreground)]">CSV Format</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                    Download our template to see the expected column format.
                  </p>
                  <button onClick={downloadTemplate} className="text-xs text-[var(--color-primary)] hover:underline mt-1">
                    ↓ Download CSV template
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="csv-store-name">Store Name</Label>
                <Input id="csv-store-name" placeholder="My Store (CSV Import)" value={csvStoreName} onChange={(e) => setCsvStoreName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="csv-file">CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  className="cursor-pointer"
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                />
                {csvFile && (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Selected: {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <Button onClick={importCSV} disabled={loading || !csvFile} className="gap-2 flex-1">
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                    : <><Upload className="h-4 w-4" /> Import Orders</>}
                </Button>
                <Button variant="outline" onClick={() => { setStep("choose"); setError(null); }}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {step === "done" && (
            <div className="text-center space-y-6 py-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>

              {connectedShop && (
                <div className="rounded-lg bg-[var(--color-muted)] p-4 text-sm">
                  <p className="font-semibold text-[var(--color-foreground)] mb-1">Shopify connected</p>
                  <p className="text-[var(--color-muted-foreground)]">
                    <strong>{connectedShop}</strong> is connected. Orders are syncing in the background.
                  </p>
                </div>
              )}

              {csvStatus && (
                <div className="rounded-lg bg-[var(--color-muted)] p-4 text-sm">
                  <p className="font-semibold text-[var(--color-foreground)] mb-1">Import complete</p>
                  <p className="text-[var(--color-muted-foreground)]">
                    ✅ {csvStatus.imported} orders imported
                    {csvStatus.errors > 0 && ` · ⚠️ ${csvStatus.errors} rows skipped`}
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <Button className="w-full gap-2" onClick={() => router.push("/dashboard")}>
                  <ArrowRight className="h-4 w-4" /> Go to Dashboard
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setStep("choose");
                    setCsvStatus(null);
                    setConnectedShop("");
                    setError(null);
                  }}
                >
                  Connect Another Store
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-[var(--color-muted-foreground)] mt-6">
          All store data is encrypted at rest and never shared with third parties.
        </p>
      </div>
    </div>
  );
}

// ── Page wrapper — Suspense boundary required for useSearchParams ─────────────

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--color-muted)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" />
      </div>
    }>
      <OnboardingInner />
    </Suspense>
  );
}
