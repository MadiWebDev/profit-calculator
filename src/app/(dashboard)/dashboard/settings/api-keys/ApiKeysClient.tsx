"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Key, Plus, Trash2, Copy, Check, Eye, EyeOff,
  Loader2, AlertTriangle, CheckCircle2, Shield,
  Clock, Activity, Lock, ExternalLink, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  usageCount: number;
  expiresAt: string | null;
  createdAt: string;
}

const SCOPE_META: Record<string, { label: string; desc: string; color: string }> = {
  "read:orders":   { label: "Read Orders",   desc: "GET /api/v1/orders",   color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  "read:products": { label: "Read Products", desc: "GET /api/v1/products", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  "read:reports":  { label: "Read Reports",  desc: "GET /api/v1/summary",  color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  "write:cogs":    { label: "Write COGS",    desc: "PATCH /api/v1/cogs",   color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
};

const ALL_SCOPES = Object.keys(SCOPE_META);

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 2592000) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="p-1 rounded hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

interface Props {
  keys: ApiKey[];
  plan: string;
}

export function ApiKeysClient({ keys: initialKeys, plan }: Props) {
  const router = useRouter();
  const isPro = plan === "pro";

  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  // Create form state
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["read:orders", "read:products", "read:reports"]);
  const [expiresIn, setExpiresIn] = useState<string>("");

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const createKey = async () => {
    if (!keyName.trim()) { setError("Key name is required."); return; }
    if (selectedScopes.length === 0) { setError("Select at least one scope."); return; }
    setCreating(true); setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: keyName.trim(),
          scopes: selectedScopes,
          expiresIn: expiresIn ? parseInt(expiresIn) : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Failed to create key."); return; }

      // Show the raw key once — never stored
      setNewKeySecret(j.key);
      setShowSecret(true);
      setShowCreate(false);
      setKeyName("");
      setSelectedScopes(["read:orders", "read:products", "read:reports"]);
      setExpiresIn("");
      router.refresh();
      // Optimistically add to list (without the secret)
      setKeys((prev) => [
        {
          id: j.id,
          name: j.name,
          keyPrefix: j.prefix,
          scopes: j.scopes,
          lastUsedAt: null,
          usageCount: 0,
          expiresAt: null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string, name: string) => {
    if (!confirm(`Revoke API key "${name}"? Any application using this key will immediately lose access.`)) return;
    setRevoking(id);
    try {
      const res = await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Revoke failed."); return; }
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Key className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">API Keys</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Authenticate external applications to read your profit data.
            </p>
          </div>
        </div>
        {isPro && (
          <Button
            size="sm"
            className="gap-2"
            onClick={() => { setShowCreate((v) => !v); setError(null); setNewKeySecret(null); }}
            disabled={keys.length >= 10}
          >
            <Plus className="h-4 w-4" />
            New Key
          </Button>
        )}
      </div>

      {/* Plan gate */}
      {!isPro && (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Lock className="h-10 w-10 mx-auto text-[var(--color-border)]" />
            <div>
              <p className="font-semibold text-[var(--color-foreground)]">API Access requires the Pro plan</p>
              <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
                Generate API keys and access your orders, products, and reports programmatically.
              </p>
            </div>
            <Button size="sm" onClick={() => router.push("/dashboard/settings")} className="gap-2">
              <Key className="h-3.5 w-3.5" /> Upgrade to Pro
            </Button>
          </CardContent>
        </Card>
      )}

      {isPro && (
        <>
          {/* Alerts */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
              <button className="ml-auto opacity-60 hover:opacity-100" onClick={() => setError(null)}>✕</button>
            </div>
          )}

          {/* New key revealed — shown only once */}
          {newKeySecret && (
            <div className="rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <p className="font-semibold text-green-800 dark:text-green-200">API key created successfully</p>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--color-card)] border border-[var(--color-border)]">
                <code className={cn("flex-1 text-sm font-mono break-all", !showSecret && "blur-sm select-none")}>
                  {newKeySecret}
                </code>
                <button
                  onClick={() => setShowSecret((v) => !v)}
                  className="p-1.5 rounded hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                  title={showSecret ? "Hide" : "Show"}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <CopyButton text={newKeySecret} />
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                This key will never be shown again. Copy it now and store it securely.
              </div>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setNewKeySecret(null)}>Dismiss</Button>
            </div>
          )}

          {/* Create form */}
          {showCreate && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4 text-[var(--color-primary)]" /> New API Key
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Key Name <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="e.g. Production Dashboard, Analytics Bot"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      className="h-9"
                      maxLength={64}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Expires In (days)</Label>
                    <Input
                      type="number"
                      placeholder="Never (leave blank)"
                      value={expiresIn}
                      onChange={(e) => setExpiresIn(e.target.value)}
                      min="1"
                      max="365"
                      className="h-9"
                    />
                    <p className="text-xs text-[var(--color-muted-foreground)]">Leave blank for non-expiring key.</p>
                  </div>
                </div>

                {/* Scopes */}
                <div className="space-y-2">
                  <Label className="text-xs">Permissions (Scopes)</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ALL_SCOPES.map((scope) => {
                      const meta = SCOPE_META[scope];
                      const checked = selectedScopes.includes(scope);
                      return (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => toggleScope(scope)}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                            checked
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                              : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"
                          )}
                        >
                          <div className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border flex-shrink-0 mt-0.5 transition-colors",
                            checked ? "bg-[var(--color-primary)] border-[var(--color-primary)]" : "border-[var(--color-border)]"
                          )}>
                            {checked && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <div>
                            <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded-full", meta.color)}>
                              {meta.label}
                            </span>
                            <p className="text-xs text-[var(--color-muted-foreground)] mt-1 font-mono">{meta.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1 border-t border-[var(--color-border)]">
                  <Button
                    size="sm"
                    onClick={createKey}
                    disabled={creating || !keyName.trim() || selectedScopes.length === 0}
                    className="gap-2"
                  >
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                    Generate Key
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Keys table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Active Keys
                  <Badge variant="outline" className="text-xs">{keys.length} / 10</Badge>
                </CardTitle>
                <a
                  href="/docs/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1"
                >
                  API Docs <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {keys.length === 0 ? (
                <div className="py-14 text-center space-y-3">
                  <Key className="h-10 w-10 mx-auto text-[var(--color-border)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-foreground)]">No API keys yet</p>
                    <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                      Create a key to start integrating with external tools.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
                    <Plus className="h-3.5 w-3.5" /> Create First Key
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {keys.map((k) => {
                    const isExpired = k.expiresAt && new Date(k.expiresAt) < new Date();
                    return (
                      <div key={k.id} className="px-5 py-4 hover:bg-[var(--color-muted)]/40 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1 space-y-2">
                            {/* Name + prefix */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm text-[var(--color-foreground)]">{k.name}</p>
                              {isExpired && (
                                <Badge variant="destructive" className="text-xs">Expired</Badge>
                              )}
                            </div>

                            {/* Key preview */}
                            <div className="flex items-center gap-1.5">
                              <code className="text-xs font-mono text-[var(--color-muted-foreground)] bg-[var(--color-muted)] px-2 py-0.5 rounded">
                                {k.keyPrefix}••••••••••••••••••••••••••
                              </code>
                              <CopyButton text={k.keyPrefix} />
                            </div>

                            {/* Scopes */}
                            <div className="flex flex-wrap gap-1.5">
                              {k.scopes.map((s) => (
                                <span key={s} className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", SCOPE_META[s]?.color ?? "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]")}>
                                  {SCOPE_META[s]?.label ?? s}
                                </span>
                              ))}
                            </div>

                            {/* Meta row */}
                            <div className="flex items-center gap-4 text-xs text-[var(--color-muted-foreground)]">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Created {timeAgo(k.createdAt)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Activity className="h-3 w-3" />
                                {k.usageCount.toLocaleString()} requests
                                {k.lastUsedAt && ` · Last used ${timeAgo(k.lastUsedAt)}`}
                              </span>
                              {k.expiresAt && (
                                <span className={cn("flex items-center gap-1", isExpired ? "text-red-500" : "")}>
                                  <AlertTriangle className="h-3 w-3" />
                                  {isExpired ? "Expired" : `Expires ${new Date(k.expiresAt).toLocaleDateString()}`}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Revoke */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeKey(k.id, k.name)}
                            disabled={revoking === k.id}
                            className="h-8 w-8 p-0 text-[var(--color-muted-foreground)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 flex-shrink-0"
                            title="Revoke key"
                          >
                            {revoking === k.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Trash2 className="h-4 w-4" />
                            }
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage guide */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4" /> Quick Start
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Include your API key in the <code className="text-xs bg-[var(--color-muted)] px-1.5 py-0.5 rounded">Authorization</code> header:
              </p>
              <pre className="text-xs bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg p-4 overflow-x-auto font-mono leading-relaxed">
{`GET /api/v1/orders?from=2026-01-01&to=2026-01-31
Authorization: Bearer pc_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json`}
              </pre>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { method: "GET", path: "/api/v1/orders",   scope: "read:orders",   desc: "Paginated order list with profit data" },
                  { method: "GET", path: "/api/v1/summary",  scope: "read:reports",  desc: "Period summary — revenue, profit, margin" },
                ].map(({ method, path, scope, desc }) => (
                  <div key={path} className="text-xs border border-[var(--color-border)] rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--color-primary)]">{method}</span>
                      <code className="font-mono text-[var(--color-foreground)]">{path}</code>
                    </div>
                    <p className="text-[var(--color-muted-foreground)]">{desc}</p>
                    <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full", SCOPE_META[scope]?.color)}>
                      {SCOPE_META[scope]?.label}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
