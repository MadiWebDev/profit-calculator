import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Key, Lock, Activity, BookOpen, Code2, ChevronRight } from "lucide-react";

export const metadata: Metadata = {
  title: "API Reference | CalcProfit",
  description: "REST API reference for CalcProfit — access your profit, order, and summary data programmatically.",
};

interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  scope: string;
  description: string;
  params?: { name: string; in: string; type: string; required: boolean; description: string }[];
  responseExample: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/orders",
    scope: "read:orders",
    description: "List paginated orders for your team. Returns revenue, COGS, net profit, and status for each order.",
    params: [
      { name: "page",   in: "query", type: "integer", required: false, description: "Page number (default: 1)" },
      { name: "limit",  in: "query", type: "integer", required: false, description: "Items per page, max 100 (default: 50)" },
      { name: "from",   in: "query", type: "string",  required: false, description: "Start date ISO-8601 (e.g. 2025-01-01)" },
      { name: "to",     in: "query", type: "string",  required: false, description: "End date ISO-8601 (e.g. 2025-01-31)" },
      { name: "status", in: "query", type: "string",  required: false, description: "Filter by status: fulfilled | refunded | cancelled" },
    ],
    responseExample: `{
  "orders": [
    {
      "id": "6624a1b2c3d4e5f6a7b8c9d0",
      "orderNumber": "#1001",
      "orderDate": "2025-01-15T10:30:00Z",
      "status": "fulfilled",
      "grossRevenue": 99.00,
      "netRevenue": 89.10,
      "totalCogs": 35.00,
      "netProfit": 41.77,
      "profitMargin": 46.88,
      "currency": "USD"
    }
  ],
  "total": 243,
  "page": 1,
  "pages": 5
}`,
  },
  {
    method: "GET",
    path: "/api/v1/summary",
    scope: "read:orders",
    description: "Aggregate profit summary for a date range — revenue, COGS, margins, ad spend, and refunds.",
    params: [
      { name: "from", in: "query", type: "string", required: true,  description: "Start date ISO-8601" },
      { name: "to",   in: "query", type: "string", required: true,  description: "End date ISO-8601" },
    ],
    responseExample: `{
  "from": "2025-01-01",
  "to":   "2025-01-31",
  "summary": {
    "totalRevenue":     12450.00,
    "totalCogs":         4230.00,
    "grossProfit":       8220.00,
    "grossMargin":          66.1,
    "totalAdSpend":      1800.00,
    "netProfit":         5940.00,
    "netMargin":            47.7,
    "orderCount":             87,
    "avgOrderValue":       143.1,
    "totalRefunds":        350.00
  }
}`,
  },
];

const methodColors: Record<string, string> = {
  GET:    "bg-blue-100  text-blue-700  dark:bg-blue-900/40  dark:text-blue-300",
  POST:   "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  PATCH:  "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  DELETE: "bg-red-100   text-red-700   dark:bg-red-900/40   dark:text-red-300",
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 lg:py-16">
        {/* Back link */}
        <Link
          href="/dashboard/settings/api-keys"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] mb-8 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to API Keys
        </Link>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <BookOpen className="h-5 w-5" />
            </span>
            <h1 className="text-3xl font-bold text-[var(--color-foreground)]">API Reference</h1>
          </div>
          <p className="text-[var(--color-muted-foreground)] max-w-2xl leading-relaxed">
            CalcProfit exposes a REST API for Pro plan users. Use it to pull your profit data into
            custom dashboards, data warehouses, or automation workflows.
          </p>
        </div>

        {/* Authentication */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-[var(--color-foreground)] flex items-center gap-2 mb-4">
            <Lock className="h-5 w-5 text-[var(--color-primary)]" /> Authentication
          </h2>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-4">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              All API requests must include a valid API key in the{" "}
              <code className="bg-[var(--color-muted)] px-1.5 py-0.5 rounded text-xs font-mono">Authorization</code>{" "}
              header using the <strong>Bearer</strong> scheme.
            </p>
            <pre className="bg-[var(--color-muted)] rounded-lg px-4 py-3 text-xs font-mono text-[var(--color-foreground)] overflow-x-auto">
{`curl https://profitcalc.io/api/v1/summary?from=2025-01-01&to=2025-01-31 \\
  -H "Authorization: Bearer pc_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}
            </pre>
            <div className="flex items-start gap-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <Key className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Keep your API key secret</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                  Never expose keys in client-side code or public repositories. Keys can be revoked
                  and regenerated from the{" "}
                  <Link href="/dashboard/settings/api-keys" className="underline">API Keys settings</Link> page.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Base URL */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-[var(--color-foreground)] flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-[var(--color-primary)]" /> Base URL & Rate Limits
          </h2>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider mb-1">Base URL</p>
              <code className="font-mono text-sm bg-[var(--color-muted)] px-3 py-2 rounded-lg block">
                https://profitcalc.io
              </code>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-[var(--color-foreground)] mb-1">Rate limit</p>
                <p className="text-[var(--color-muted-foreground)]">100 requests per 60 seconds per API key</p>
              </div>
              <div>
                <p className="font-medium text-[var(--color-foreground)] mb-1">Response format</p>
                <p className="text-[var(--color-muted-foreground)]">JSON, UTF-8. Always returns{" "}
                  <code className="bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Content-Type: application/json</code>.
                </p>
              </div>
              <div>
                <p className="font-medium text-[var(--color-foreground)] mb-1">Rate limit headers</p>
                <p className="text-[var(--color-muted-foreground)]">
                  <code className="bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">X-RateLimit-Remaining</code>,{" "}
                  <code className="bg-[var(--color-muted)] px-1 py-0.5 rounded text-xs">Retry-After</code>
                </p>
              </div>
              <div>
                <p className="font-medium text-[var(--color-foreground)] mb-1">Availability</p>
                <p className="text-[var(--color-muted-foreground)]">Pro plan only. All responses include HTTP status codes.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Endpoints */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-[var(--color-foreground)] flex items-center gap-2 mb-4">
            <Code2 className="h-5 w-5 text-[var(--color-primary)]" /> Endpoints
          </h2>
          <div className="space-y-6">
            {ENDPOINTS.map((ep) => (
              <div key={ep.path} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
                {/* Endpoint header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-muted)]/40">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-md font-mono uppercase tracking-wide ${methodColors[ep.method]}`}>
                    {ep.method}
                  </span>
                  <code className="font-mono text-sm font-semibold text-[var(--color-foreground)]">{ep.path}</code>
                  <span className="ml-auto">
                    <code className="text-xs bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded font-mono">
                      {ep.scope}
                    </code>
                  </span>
                </div>

                <div className="p-6 space-y-5">
                  <p className="text-sm text-[var(--color-muted-foreground)]">{ep.description}</p>

                  {/* Parameters */}
                  {ep.params && ep.params.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">Parameters</p>
                      <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-[var(--color-muted)]/60">
                            <tr>
                              {["Name", "In", "Type", "Required", "Description"].map((h) => (
                                <th key={h} className="text-left px-3 py-2 font-semibold text-[var(--color-muted-foreground)]">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ep.params.map((p) => (
                              <tr key={p.name} className="border-t border-[var(--color-border)]">
                                <td className="px-3 py-2 font-mono font-medium text-[var(--color-foreground)]">{p.name}</td>
                                <td className="px-3 py-2 text-[var(--color-muted-foreground)]">{p.in}</td>
                                <td className="px-3 py-2 font-mono text-[var(--color-muted-foreground)]">{p.type}</td>
                                <td className="px-3 py-2">
                                  {p.required
                                    ? <span className="text-red-500 font-semibold">yes</span>
                                    : <span className="text-[var(--color-muted-foreground)]">no</span>}
                                </td>
                                <td className="px-3 py-2 text-[var(--color-muted-foreground)]">{p.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Response example */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
                      Response Example (200 OK)
                    </p>
                    <pre className="bg-[var(--color-muted)] rounded-lg px-4 py-3 text-xs font-mono text-[var(--color-foreground)] overflow-x-auto leading-relaxed">
                      {ep.responseExample}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Error codes */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-4">Error Codes</h2>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)]/60">
                <tr>
                  {["Status", "Meaning"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-[var(--color-muted-foreground)] text-xs uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["401 Unauthorized",        "API key missing or invalid."],
                  ["403 Forbidden",            "Valid key but insufficient scope, or plan does not include API access."],
                  ["404 Not Found",            "Resource does not exist or belongs to another team."],
                  ["422 Unprocessable",        "Invalid query parameters. Check the error message for details."],
                  ["429 Too Many Requests",    "Rate limit exceeded. Check Retry-After header."],
                  ["500 Internal Server Error","Server error. If persistent, contact support."],
                ].map(([status, meaning]) => (
                  <tr key={status} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-3 font-mono font-medium text-[var(--color-foreground)] text-xs">{status}</td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-6 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-[var(--color-foreground)]">Ready to get started?</p>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
              Generate an API key from your settings page.
            </p>
          </div>
          <Link
            href="/dashboard/settings/api-keys"
            className="inline-flex items-center gap-2 bg-[var(--color-primary)] text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Key className="h-4 w-4" /> Manage API Keys <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
