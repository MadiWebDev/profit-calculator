"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Check, LogOut, Search } from "lucide-react";
import { CURRENCIES, useCurrency } from "@/components/dashboard/CurrencyContext";
import { getSupportedTimezones, isValidTimezone } from "@/lib/timezones";
import { needsOnboardingModal, resolveOnboardingPrefill } from "@/lib/onboarding-lock";
import { cn } from "@/lib/utils";

/**
 * Blocking onboarding modal — first dashboard visit after sign-up.
 *
 * TRIGGER (exact rule, see src/lib/onboarding-lock.ts): the signed-in
 * user has a team and onboardingCompleted is not true. Grandfathered
 * users (already saved a displayCurrency) still see it while their
 * flag is false, but with the currency field locked to the saved value
 * and the timezone prefilled from their team's timezone.
 *
 * No close button, no skip, no Escape/backdrop dismiss — the dashboard
 * behind it is not usable until saved. Signing out is still possible
 * (the button at the bottom of the modal).
 *
 * On save, ONE PATCH /api/user writes displayCurrency + timezone +
 * name and sets onboardingCompleted: true. Locked fields are never
 * sent. The modal never appears again after that.
 */

const WARNING_COPY =
  "Your currency and timezone apply to your entire dashboard and cannot be changed after you save. Your name can be changed anytime in Settings.";

export function OnboardingModal() {
  const { data: session, status, update: updateSession } = useSession();
  const { detectedCurrency } = useCurrency();
  const [team, setTeam] = useState<{ currency: string; timezone: string } | null>(null);
  const [teamLoaded, setTeamLoaded] = useState(false);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currencyQuery, setCurrencyQuery] = useState("");
  const [tzQuery, setTzQuery] = useState("");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [tzOpen, setTzOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const initializedFor = useRef<string | null>(null);

  const su = session?.user as
    | {
        id?: string;
        name?: string | null;
        teamId?: string | null;
        displayCurrency?: string | null;
        timezone?: string | null;
        onboardingCompleted?: boolean;
      }
    | undefined;

  const show = status === "authenticated" && !done && needsOnboardingModal({
    onboardingCompleted: su?.onboardingCompleted,
    teamId: su?.teamId,
  });

  const currencyLocked = Boolean(su?.displayCurrency);
  const timezoneLocked = Boolean(su?.timezone);

  // Team currency/timezone feed the prefills (grandfathering: the
  // team's timezone seeds the timezone default when the user has none).
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/team")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const t = j?.team;
        if (t) setTeam({ currency: typeof t.currency === "string" ? t.currency : "USD", timezone: typeof t.timezone === "string" ? t.timezone : "UTC" });
      })
      .catch(() => {
        // Team unknown — prefills fall back to detection / browser.
      })
      .finally(() => {
        if (!cancelled) setTeamLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // One-time prefill, once the session and the team value are known.
  // Runs once per user id so a save in progress is never clobbered.
  useEffect(() => {
    if (!show || !teamLoaded || !su?.id) return;
    if (initializedFor.current === su.id) return;
    initializedFor.current = su.id;
    let browserTz = "UTC";
    try {
      browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      browserTz = "UTC";
    }
    const prefill = resolveOnboardingPrefill({
      displayCurrency: su.displayCurrency ?? null,
      timezone: su.timezone ?? null,
      teamTimezone: team?.timezone ?? null,
      teamCurrency: team?.currency ?? null,
      detectedCurrency: detectedCurrency?.code ?? null,
      browserTimezone: browserTz,
    });
    // One-time prefill, not a render cascade.
    setName(su.name ?? "");
    setCurrency(prefill.currencyDefault);
    setTimezone(prefill.timezoneDefault);
    setCurrencyQuery("");
    setTzQuery(prefill.timezoneDefault);
  }, [show, teamLoaded, su?.id, su?.displayCurrency, su?.timezone, su?.name, team?.timezone, team?.currency, detectedCurrency?.code]);

  const timezones = useMemo(() => getSupportedTimezones(), []);

  const filteredCurrencies = useMemo(() => {
    const q = currencyQuery.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.label.toLowerCase().includes(q),
    );
  }, [currencyQuery]);

  const filteredTimezones = useMemo(() => {
    const q = tzQuery.trim().toLowerCase();
    if (!q) return timezones;
    return timezones.filter((tz) => tz.toLowerCase().includes(q));
  }, [tzQuery, timezones]);

  if (!show) return null;

  const currencyDef = CURRENCIES.find((c) => c.code === currency);
  const canSave =
    !saving && name.trim().length > 0 && currency.length === 3 && isValidTimezone(timezone);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        onboardingCompleted: true,
      };
      // Locked fields are never sent — the server would reject them.
      if (!currencyLocked) body.displayCurrency = currency;
      if (!timezoneLocked) body.timezone = timezone;
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const code = typeof j?.code === "string" ? j.code : "";
        if (code === "CURRENCY_LOCKED" || code === "TIMEZONE_LOCKED") {
          setError("This was already set during onboarding and cannot be changed. Reload the page to continue.");
        } else {
          setError(typeof j?.error === "string" ? j.error : "Save failed. Check your connection and try again.");
        }
        return;
      }
      // Refresh the session WITH data: a bare updateSession() is a
      // plain session GET, and the jwt() backfill only re-reads the DB
      // on trigger "update" (or the 5-minute check) — without the data
      // payload the JWT would keep onboardingCompleted: false and the
      // modal would reappear on the next page. Passing data forces the
      // "update" trigger, the backfill reads the saved values from the
      // DB, and the re-encoded cookie carries them.
      //
      // Pass ONLY the onboarding fields: spreading the whole session
      // user would carry twoFactorPending: false into the payload,
      // which takes auth.ts's 2FA-update early return — it returns the
      // base token WITHOUT the backfill and freezes the stale values
      // into the re-encoded cookie.
      await updateSession({
        user: {
          name: name.trim(),
          email: session?.user?.email ?? "",
          displayCurrency: currencyLocked ? (su?.displayCurrency ?? null) : currency,
          timezone: timezoneLocked ? (su?.timezone ?? null) : timezone,
          onboardingCompleted: true,
        },
      }).catch(() => {});
      setDone(true);
    } catch {
      setError("Save failed. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Complete your setup"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-foreground)]">Complete your setup</h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              A few details before you start — your currency and timezone are set once, here.
            </p>
          </div>

          {/* Display name — changeable later in Settings → Profile */}
          <div className="space-y-1.5">
            <label htmlFor="onboarding-name" className="text-xs font-medium text-[var(--color-foreground)]">
              Display name
            </label>
            <input
              id="onboarding-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={80}
              className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            />
          </div>

          {/* Currency — searchable, full 148-currency registry */}
          <div className="space-y-1.5">
            <label htmlFor="onboarding-currency-search" className="text-xs font-medium text-[var(--color-foreground)]">
              Currency{currencyLocked ? " (already set — locked)" : ""}
            </label>
            {currencyLocked ? (
              <div className="flex h-10 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-sm text-[var(--color-foreground)]">
                {currencyDef ? `${currencyDef.label} — ${currencyDef.code}` : currency}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]" aria-hidden />
                  <input
                    id="onboarding-currency-search"
                    type="text"
                    value={currencyQuery}
                    onChange={(e) => {
                      setCurrencyQuery(e.target.value);
                      setCurrencyOpen(true);
                    }}
                    onFocus={() => setCurrencyOpen(true)}
                    placeholder={currency ? `${currencyDef?.label ?? currency} — search to change` : "Search currencies…"}
                    aria-label="Search currencies"
                    className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] pl-8 pr-3 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                  />
                </div>
                {currencyOpen && (
                  <div role="listbox" aria-label="Select currency" className="max-h-48 overflow-y-auto rounded-md border border-[var(--color-border)] py-1">
                    {filteredCurrencies.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-center text-[var(--color-muted-foreground)]">No currencies found</p>
                    ) : (
                      filteredCurrencies.map((c) => {
                        const active = c.code === currency;
                        return (
                          <button
                            key={c.code}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setCurrency(c.code);
                              setCurrencyQuery("");
                              setCurrencyOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-left",
                              active
                                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                                : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
                            )}
                          >
                            <span>{c.label}</span>
                            <span className="text-xs text-[var(--color-muted-foreground)]">{c.code}</span>
                            {active && <Check className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Selected: {currencyDef ? `${currencyDef.label} (${currencyDef.code})` : currency || "None yet"}
                </p>
              </>
            )}
          </div>

          {/* Timezone — searchable IANA selector */}
          <div className="space-y-1.5">
            <label htmlFor="onboarding-timezone-search" className="text-xs font-medium text-[var(--color-foreground)]">
              Timezone{timezoneLocked ? " (already set — locked)" : ""}
            </label>
            {timezoneLocked ? (
              <div className="flex h-10 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-sm text-[var(--color-foreground)]">
                {timezone}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]" aria-hidden />
                  <input
                    id="onboarding-timezone-search"
                    type="text"
                    value={tzQuery}
                    onChange={(e) => {
                      setTzQuery(e.target.value);
                      setTzOpen(true);
                      setTimezone(e.target.value);
                    }}
                    onFocus={() => setTzOpen(true)}
                    placeholder="Search timezones…"
                    aria-label="Search timezones"
                    className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] pl-8 pr-3 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                  />
                </div>
                {tzOpen && (
                  <div role="listbox" aria-label="Select timezone" className="max-h-48 overflow-y-auto rounded-md border border-[var(--color-border)] py-1">
                    {filteredTimezones.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-center text-[var(--color-muted-foreground)]">No timezones found</p>
                    ) : (
                      filteredTimezones.slice(0, 100).map((tz) => {
                        const active = tz === timezone;
                        return (
                          <button
                            key={tz}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setTimezone(tz);
                              setTzQuery(tz);
                              setTzOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-left",
                              active
                                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                                : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
                            )}
                          >
                            <span>{tz}</span>
                            {active && <Check className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Selected: {timezone || "None yet"}
                  {!isValidTimezone(timezone) && timezone !== "" ? " — pick a timezone from the list" : ""}
                </p>
              </>
            )}
          </div>

          {/* Warning — exact copy from the plan */}
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {WARNING_COPY}
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="h-10 w-full rounded-md bg-[var(--color-primary)] text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save and continue"}
          </button>

          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/auth/login" })}
            className="mx-auto flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] underline underline-offset-2 hover:text-[var(--color-foreground)]"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
